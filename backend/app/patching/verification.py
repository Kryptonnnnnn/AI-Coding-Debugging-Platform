"""Deterministic verification of a proposed patch. Nothing here executes user code on the API host:
syntax/static checks parse text, and tests run only through the isolated sandbox provider (if available)."""
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import CodePatch, ProjectFile
from app.sandbox.base import ExecRequest
from app.sandbox.docker_sandbox import get_sandbox
from app.static_analysis.service import analyze

MAX_TEST_FILES = 3


def _now() -> str:
    return datetime.now(UTC).isoformat()


def add_event(patch: CodePatch, event: str, **extra) -> None:
    v = dict(patch.verification or {})
    v["events"] = [*v.get("events", []), {"event": event, "at": _now(), **extra}][-50:]
    patch.verification = v  # reassign so SQLAlchemy sees the JSON change


def _key(f) -> tuple:
    return (f.tool, f.rule_id, f.message)  # line-agnostic so a moved finding isn't reported as new


async def _static(path: str, code: str, language: str):
    res = await analyze(path, code, language)
    syntax_err = next((f for f in res.findings if f.rule_id == "SyntaxError"), None)
    return res, syntax_err


async def verify_patch(db: AsyncSession, patch: CodePatch, file: ProjectFile, test_paths: list[str] | None = None) -> dict:
    lang = file.language
    before, b_err = await _static(file.path, patch.original_content, lang)
    after, a_err = await _static(file.path, patch.proposed_content, lang)
    bk, ak = {_key(f): f for f in before.findings}, {_key(f): f for f in after.findings}
    new = [ak[k] for k in ak if k not in bk]
    resolved = [bk[k] for k in bk if k not in ak]
    ran_tools = [t.model_dump() for t in after.tools]
    analyzers = [t for t in after.tools if t.status == "ran"]

    execution: dict
    sb = get_sandbox()
    st = await sb.status()
    if not test_paths:
        execution = {"status": "not_executed", "reason": "No test files were selected for execution."}
    elif not st.available:
        execution = {"status": "not_executed", "reason": f"Sandbox unavailable: {st.reason}"}
    elif lang != "python":
        execution = {"status": "not_executed", "reason": "Sandboxed test execution is only supported for Python (pytest)."}
    elif a_err is not None:
        execution = {"status": "not_executed", "reason": "Skipped: the proposed code has a syntax error."}
    else:
        project_files = {f.path: f.content for f in (await db.scalars(select(ProjectFile).where(ProjectFile.project_id == patch.project_id))).all()}
        project_files[file.path] = patch.proposed_content  # overlay: the patch is NOT written to the project
        results = []
        for tp in test_paths[:MAX_TEST_FILES]:
            if tp not in project_files:
                results.append({"test_path": tp, "status": "error", "detail": "test file not found in project"})
                continue
            out = await sb.execute(ExecRequest(files=project_files, entry=tp, language="python", kind="test"))
            results.append({"test_path": tp, "status": "passed" if out.exit_code == 0 else "timed_out" if out.timed_out else "failed",
                            "exit_code": out.exit_code, "duration_ms": out.duration_ms, "truncated": out.truncated,
                            "output": (out.stdout + ("\n" + out.stderr if out.stderr else ""))[-4000:]})
        execution = {"status": "executed", "sandbox": st.provider, "results": results}

    notes: list[str] = []
    if a_err is not None:
        notes.append(f"The proposed code does not parse (line {a_err.line}): {a_err.message}. Do not apply it.")
    elif b_err is not None:
        notes.append("The original file did not parse; the proposed code does.")
    if new:
        notes.append(f"{len(new)} new tool finding(s) would be introduced.")
    if resolved:
        notes.append(f"{len(resolved)} tool finding(s) would be resolved.")
    if not analyzers:
        notes.append(f"No deterministic analyzer ran for {lang}; only AI review is available for this language.")
    if execution["status"] == "not_executed":
        notes.append("Tests were not executed. A passing result is never assumed.")

    prev = patch.verification or {}
    result = {
        "checked_at": _now(), "language": lang,
        "syntax": {"original_ok": b_err is None, "proposed_ok": a_err is None,
                   "proposed_error": {"line": a_err.line, "message": a_err.message} if a_err else None, "checked_by": "parser" if analyzers else "none"},
        "static": {"tools": ran_tools, "new_findings": [f.model_dump() for f in new], "resolved_findings": [f.model_dump() for f in resolved],
                   "unchanged_count": len(set(ak) & set(bk))},
        "execution": execution, "notes": notes, "events": prev.get("events", []),
        **({"post_apply": prev["post_apply"]} if "post_apply" in prev else {}),
    }
    patch.verification = result
    add_event(patch, "verified", executed=execution["status"] == "executed")
    return patch.verification


async def post_apply_check(patch: CodePatch, file: ProjectFile) -> None:
    """Records an after-the-fact syntax/static check of the content that was actually written."""
    res, err = await _static(file.path, file.content, file.language)
    v = dict(patch.verification or {})
    v["post_apply"] = {"checked_at": _now(), "syntax_ok": err is None, "tool_findings": len(res.findings),
                       "analyzers_ran": [t.tool for t in res.tools if t.status == "ran"]}
    patch.verification = v
    add_event(patch, "applied")
