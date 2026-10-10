import uuid

from fastapi import APIRouter, Depends, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user, owned_file, owned_project
from app.core.db import get_db
from app.core.errors import AppError, NotFound
from app.debugging.service import run_debug
from app.models.models import CodePatch, CodeSession, DebuggingReport, ProjectFile, User
from app.patching.engine import diff_stats
from app.schemas.common import DebugIn, Page
from app.services.ai_gateway import resolve_provider

router = APIRouter(tags=["debugging"])


def _report_out(r: DebuggingReport) -> dict:
    return {"id": str(r.id), "project_id": str(r.project_id) if r.project_id else None, "task": r.task, "language": r.language,
            "provider": r.provider, "model": r.model, "created_at": r.created_at, "report": r.report,
            "tool_findings": r.tool_findings, "input": r.input,
            "disclaimer": "AI output is a hypothesis unless confirmed by tool findings or tests."}


@router.post("/debug", status_code=201)
async def debug(body: DebugIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await owned_project(db, user, body.project_id)
    target = await owned_file(db, user, body.file_id, body.project_id) if body.file_id else None
    if not target and not body.code:
        raise AppError("Provide a file or code to analyze.", code="missing_input")
    extras = []
    if body.extra_file_ids:
        extras = (await db.scalars(select(ProjectFile).where(ProjectFile.project_id == body.project_id,
                                                             ProjectFile.id.in_(body.extra_file_ids)))).all()
    provider = await resolve_provider(db, user, body.provider, body.model)
    rec, patch, meta = await run_debug(db, user, provider, body, target, list(extras))
    await db.commit()
    out = _report_out(rec)
    out["meta"] = meta
    out["patch_id"] = str(patch.id) if patch else None
    return out


@router.get("/reports", response_model=Page[dict])
async def list_reports(project_id: uuid.UUID | None = None, q: str = "", page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                       user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    cond = [DebuggingReport.user_id == user.id]
    if project_id:
        cond.append(DebuggingReport.project_id == project_id)
    rows = (await db.scalars(select(DebuggingReport).where(*cond).order_by(DebuggingReport.created_at.desc()))).all()
    if q:
        rows = [r for r in rows if q.lower() in (r.report.get("summary", "") + r.input.get("path", "")).lower()]
    total = len(rows)
    rows = rows[(page - 1) * page_size : page * page_size]
    return Page(items=[_report_out(r) | {"summary": r.report.get("summary", "")} for r in rows], total=total, page=page, page_size=page_size)


async def _owned_report(db: AsyncSession, user: User, report_id: uuid.UUID) -> DebuggingReport:
    r = await db.scalar(select(DebuggingReport).where(DebuggingReport.id == report_id, DebuggingReport.user_id == user.id))
    if not r:
        raise NotFound("Report not found.")
    return r


@router.get("/reports/{report_id}")
async def get_report(report_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    r = await _owned_report(db, user, report_id)
    patch = await db.scalar(select(CodePatch).where(CodePatch.report_id == r.id).order_by(CodePatch.created_at.desc()))
    return _report_out(r) | {"patch_id": str(patch.id) if patch else None}


@router.delete("/reports/{report_id}", status_code=204)
async def delete_report(report_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await db.delete(await _owned_report(db, user, report_id))
    await db.commit()


def _fence(code: str, lang: str = "") -> str:
    ticks = "```"
    while ticks in code:
        ticks += "`"
    return f"{ticks}{lang}\n{code}\n{ticks}"


@router.get("/reports/{report_id}/export.md", response_class=PlainTextResponse)
async def export_markdown(report_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    r = await _owned_report(db, user, report_id)
    d = r.report
    md = [f"# Debugging report: {d.get('summary', '')}", "",
          f"- Task: {r.task}\n- Language: {r.language}\n- Provider/model: {r.provider} / {r.model}\n- Created: {r.created_at:%Y-%m-%d %H:%M} UTC", "",
          "> AI-generated analysis is a hypothesis unless confirmed by a deterministic tool finding or a passing test.", "",
          "## Likely root cause", d.get("root_cause") or "_not determined_", ""]
    if d.get("evidence"):
        md.append("## Evidence")
        for e in d["evidence"]:
            loc = f"{e['file']}:{e['line_start']}" if e.get("line_verified") else f"{e['file']} (line not verified)"
            md += [f"- **{loc}** {e.get('note', '')}", _fence(e.get("quote", ""))]
        md.append("")
    md += [f"## Confidence: {d.get('confidence')}", d.get("confidence_reasoning", ""), "",
           "## Suggested fix", d.get("suggested_fix") or "_none_", ""]
    if d.get("corrected_code"):
        md += ["### Corrected code", _fence(d["corrected_code"]), ""]
    for title, key in (("Why this fix works", "fix_explanation"),):
        if d.get(key):
            md += [f"## {title}", d[key], ""]
    for title, key in (("Potential regressions", "regressions"), ("Verification steps", "verification_steps")):
        if d.get(key):
            md += [f"## {title}"] + [f"- {x}" for x in d[key]] + [""]
    for s in d.get("sections", []):
        md += [f"## {s['heading']}", s["body"], ""]
    if r.tool_findings:
        md += ["## Deterministic tool findings"] + [
            f"- `{f['tool']}` {f['rule_id']} line {f.get('line')}: {f['message']}" for f in r.tool_findings] + [""]
    return "\n".join(md)


@router.get("/sessions", response_model=Page[dict])
async def list_sessions(kind: str = "", q: str = "", project_id: uuid.UUID | None = None, page: int = Query(1, ge=1),
                        page_size: int = Query(20, ge=1, le=100), user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    cond = [CodeSession.user_id == user.id]
    if kind:
        cond.append(CodeSession.kind.like(f"{kind}%"))
    if q:
        cond.append(func.lower(CodeSession.title).like(f"%{q.lower()}%"))
    if project_id:
        cond.append(CodeSession.project_id == project_id)
    total = await db.scalar(select(func.count(CodeSession.id)).where(*cond))
    rows = (await db.scalars(select(CodeSession).where(*cond).order_by(CodeSession.created_at.desc())
                             .offset((page - 1) * page_size).limit(page_size))).all()
    items = [{"id": str(s.id), "kind": s.kind, "title": s.title, "project_id": str(s.project_id) if s.project_id else None,
              "ref_id": str(s.ref_id) if s.ref_id else None, "created_at": s.created_at} for s in rows]
    return Page(items=items, total=total or 0, page=page, page_size=page_size)
