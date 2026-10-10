import json
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.base import AIProvider, ChatMessage
from app.ai.structured import run_structured
from app.core.redaction import redact_secrets
from app.models.models import CodePatch, CodeSession, DebuggingReport, ProjectFile, User
from app.patching.engine import diff_stats, make_diff
from app.schemas.ai_outputs import DebugReport
from app.schemas.common import DebugIn
from app.services.ai_gateway import record_usage, system_message
from app.services.context import SYSTEM_RULES, build_context
from app.services.files import sha
from app.services.languages import detect_language
from app.static_analysis.service import analyze

TASK_INSTRUCTIONS = {
    "debug": "Diagnose the failure. Provide root cause, evidence, a fix and corrected_code (the COMPLETE corrected file).",
    "explain_error": "Explain what the error means in plain language and where it likely originates.",
    "root_cause": "Identify the most likely root cause with evidence. corrected_code may be null.",
    "suggest_fix": "Suggest a fix and provide corrected_code (the COMPLETE corrected file).",
    "alternatives": "Give several alternative fixes with trade-offs in alternative_fixes.",
    "explain_code": "Explain the code line by line, in `sections` (one section per logical block).",
    "edge_cases": "List edge cases and unhandled inputs in `sections`.",
    "readability": "Improve readability without changing behavior; provide corrected_code (COMPLETE file).",
    "optimize": "Suggest performance optimizations without changing behavior; provide corrected_code (COMPLETE file).",
    "refactor": "Refactor safely preserving behavior; provide corrected_code (COMPLETE file) and list regressions to watch.",
    "repro": "Produce a minimal reproduction example in `sections`.",
}


def verify_evidence(report: DebugReport, files: dict[str, str]) -> None:
    """Line numbers are only kept when the quoted text is really present in the supplied code."""
    for ev in report.evidence:
        ev.line_start = ev.line_end = None
        ev.line_verified = False
        quote = ev.quote.strip()
        if not quote:
            continue
        candidates = [ev.file] if ev.file in files else list(files)
        for path in candidates:
            idx = files[path].find(quote)
            if idx >= 0:
                ev.file = path
                ev.line_start = files[path].count("\n", 0, idx) + 1
                ev.line_end = ev.line_start + quote.count("\n")
                ev.line_verified = True
                break


async def run_debug(db: AsyncSession, user: User, provider: AIProvider, data: DebugIn,
                    target: ProjectFile | None, extras: list[ProjectFile]) -> tuple[DebuggingReport, CodePatch | None, dict]:
    path = target.path if target else "snippet"
    code = target.content if target else (data.code or "")
    language = data.language or (target.language if target else detect_language(path, code))

    ctx_files: list = [(path, code)] + extras
    ctx = build_context(ctx_files)
    safe = lambda s: redact_secrets(s)  # noqa: E731
    user_msg = (
        f"Language: {language}\n\n{ctx.text}\n\n"
        f"<error>{safe(data.error_message)}</error>\n<trace>{safe(data.stack_trace)}</trace>\n"
        f"<expected>{safe(data.expected)}</expected>\n<actual>{safe(data.actual)}</actual>\n"
        f"<repro>{safe(data.repro_steps)}</repro>\n\nTask: {TASK_INSTRUCTIONS[data.task]}"
    )
    messages = [
        system_message(data.task, SYSTEM_RULES, json.dumps(DebugReport.model_json_schema())),
        ChatMessage("user", user_msg),
    ]
    report, comps = await run_structured(provider, messages, DebugReport)
    verify_evidence(report, {p: c for p, c in [(path, code)] + [(e.path, e.content) for e in extras]})

    tool_findings = []
    if language in ("python", "javascript"):
        res = await analyze(path, code, language, security=False)
        tool_findings = [f.model_dump() for f in res.findings]

    usage = await record_usage(db, user.id, f"debug:{data.task}", provider, comps)
    rec = DebuggingReport(
        user_id=user.id, project_id=data.project_id, file_id=target.id if target else None, task=data.task,
        language=language, provider=provider.name, model=provider.model, tool_findings=tool_findings,
        input={"path": path, "error_message": safe(data.error_message)[:2000], "expected": data.expected[:1000],
               "actual": data.actual[:1000], "context": ctx.summary()},
        report=report.model_dump(),
    )
    db.add(rec)
    await db.flush()
    db.add(CodeSession(user_id=user.id, project_id=data.project_id, kind=f"debug:{data.task}",
                       title=report.summary[:190] or "Debugging session", ref_id=rec.id))

    patch = None
    if target and report.corrected_code and report.corrected_code != target.content:
        proposed = report.corrected_code
        diff = make_diff(target.content, proposed, target.path)
        patch = CodePatch(user_id=user.id, project_id=target.project_id, file_id=target.id, report_id=rec.id,
                          title=(report.suggested_fix or "AI-proposed fix")[:190], explanation=report.fix_explanation,
                          base_sha256=sha(target.content), original_content=target.content,
                          proposed_content=proposed, diff=diff)
        db.add(patch)
        await db.flush()
    return rec, patch, {"usage": usage, "context": ctx.summary()} | (
        {"patch_stats": diff_stats(patch.diff).__dict__} if patch else {}
    )
