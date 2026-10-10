import json

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.base import AIProvider, ChatMessage
from app.ai.structured import run_structured
from app.core.redaction import scan_secrets
from app.models.models import CodeReview, CodeReviewFinding, CodeSession, ProjectFile, User
from app.schemas.ai_outputs import ReviewOutput
from app.services.ai_gateway import record_usage, system_message
from app.services.context import SYSTEM_RULES, build_context, is_auto_excluded
from app.services.languages import SUPPORTED
from app.static_analysis.service import analyze

DEPTH = {  # (max files, context chars, instruction)
    "quick": (3, 12_000, "Quick review: report only the most important correctness and security problems (at most 5)."),
    "standard": (10, 32_000, "Standard review: cover correctness, security, error handling, validation, maintainability, tests."),
    "deep": (25, 48_000, "Deep review: be thorough across correctness, security, authz, performance, dependency/config risks, "
                          "missing tests and edge cases."),
}
SEVERITIES = {"critical", "high", "medium", "low", "info"}


def select_files(all_files: list[ProjectFile], explicit: bool, depth: str) -> tuple[list[ProjectFile], list[dict]]:
    """Bounded manifest. Explicit selections bypass auto-exclusions (but are still redacted + warned)."""
    max_files = DEPTH[depth][0]
    skipped: list[dict] = []
    chosen: list[ProjectFile] = []
    for f in sorted(all_files, key=lambda x: x.path):
        if not explicit:
            if is_auto_excluded(f.path):
                skipped.append({"path": f.path, "reason": "excluded by default (secrets/dependencies)"})
                continue
            if f.language not in SUPPORTED:
                skipped.append({"path": f.path, "reason": "not a supported source language"})
                continue
        if len(chosen) >= max_files:
            skipped.append({"path": f.path, "reason": f"over the {depth} review file limit ({max_files})"})
            continue
        chosen.append(f)
    return chosen, skipped


async def run_review(db: AsyncSession, user: User, provider: AIProvider, project_id, files: list[ProjectFile],
                     depth: str, skipped: list[dict]) -> tuple[CodeReview, dict]:
    _, budget, instruction = DEPTH[depth]
    ctx = build_context(files, max_chars=budget, per_file_chars=max(2000, budget // max(1, len(files))))
    paths = {f.path: f for f in files}
    messages = [
        system_message("review", SYSTEM_RULES + "\nSeverity must be one of: critical, high, medium, low, info.",
                       json.dumps(ReviewOutput.model_json_schema())),
        ChatMessage("user", f"{ctx.text}\n\nTask: {instruction}"),
    ]
    out, comps = await run_structured(provider, messages, ReviewOutput, max_tokens=3000)

    rows: list[CodeReviewFinding] = []
    tool_hits: dict[str, list[int]] = {}
    tools_run: list[dict] = []
    for f in files:
        if f.language in ("python", "javascript"):
            res = await analyze(f.path, f.content, f.language)
            tools_run += [{"file": f.path, **t.model_dump()} for t in res.tools]
            for tf in res.findings:
                tool_hits.setdefault(f.path, []).append(tf.line or -999)
                rows.append(CodeReviewFinding(
                    severity=tf.severity, category="static-analysis", file_path=f.path, line_start=tf.line, line_end=tf.line,
                    title=f"{tf.tool}: {tf.rule_id}", description=tf.message, remediation=tf.remediation,
                    source="tool", tool_confirmed=True, rule_id=tf.rule_id))
        for w in scan_secrets(f.content):
            rows.append(CodeReviewFinding(
                severity="high", category="secrets", file_path=f.path, line_start=w.line, line_end=w.line,
                title=f"Possible secret: {w.kind}", description="A value resembling a credential is committed in the source (value withheld).",
                remediation="Remove it, rotate the credential, and load it from the environment.", source="tool",
                tool_confirmed=True, rule_id="secret-scan"))

    for fd in out.findings:
        sev = fd.severity if fd.severity in SEVERITIES else "info"
        start = end = None
        f = paths.get(fd.file_path)
        quote = fd.evidence_quote.strip()
        if f and quote and quote in f.content:
            start = f.content.count("\n", 0, f.content.index(quote)) + 1
            end = start + quote.count("\n")
        confirmed = start is not None and any(start <= ln <= (end or start) for ln in tool_hits.get(fd.file_path, []))
        rows.append(CodeReviewFinding(
            severity=sev, category=fd.category[:40], file_path=fd.file_path if f else "", line_start=start, line_end=end,
            title=fd.title[:290], description=fd.description, evidence=quote if start else "", remediation=fd.remediation,
            source="ai", tool_confirmed=confirmed))

    order = {s: i for i, s in enumerate(["critical", "high", "medium", "low", "info"])}
    rows.sort(key=lambda r: order.get(r.severity, 9))
    limitations = list(out.limitations) + [
        "This review is not exhaustive and does not guarantee that all vulnerabilities were found.",
        "AI findings are hypotheses; only findings marked tool-confirmed are backed by a deterministic tool.",
    ] + [f"Skipped {s['path']}: {s['reason']}" for s in skipped] + [
        f"Redacted secret-like values in {i.path} before sending to the model." for i in ctx.included if i.redacted] + [
        f"{i.path} was truncated to fit the context budget." for i in ctx.included if i.truncated]

    usage = await record_usage(db, user.id, f"review:{depth}", provider, comps)
    review = CodeReview(user_id=user.id, project_id=project_id, depth=depth, scope=[f.path for f in files],
                        summary=out.summary, limitations=limitations, provider=provider.name, model=provider.model)
    review.findings = rows
    db.add(review)
    await db.flush()
    db.add(CodeSession(user_id=user.id, project_id=project_id, kind="review", title=f"{depth.title()} review: {len(files)} file(s)",
                       ref_id=review.id))
    return review, {"usage": usage, "context": ctx.summary(), "tools": tools_run}
