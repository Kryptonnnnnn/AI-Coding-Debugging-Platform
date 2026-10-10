import uuid

from fastapi import APIRouter, Depends, Query
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user, owned_project
from app.code_review.service import run_review, select_files
from app.core.db import get_db
from app.core.errors import AppError, NotFound
from app.models.models import CodeReview, ProjectFile, User
from app.schemas.common import Page, ReviewIn
from app.services.ai_gateway import resolve_provider

router = APIRouter(tags=["review"])


def _out(r: CodeReview, meta: dict | None = None) -> dict:
    d = {"id": str(r.id), "is_baseline": r.is_baseline, "label": r.label, "project_id": str(r.project_id) if r.project_id else None, "depth": r.depth, "scope": r.scope,
         "summary": r.summary, "limitations": r.limitations, "provider": r.provider, "model": r.model, "created_at": r.created_at,
         "findings": [{"id": str(f.id), "severity": f.severity, "category": f.category, "file_path": f.file_path,
                       "line_start": f.line_start, "line_end": f.line_end, "title": f.title, "description": f.description,
                       "evidence": f.evidence, "remediation": f.remediation, "source": f.source,
                       "tool_confirmed": f.tool_confirmed, "rule_id": f.rule_id,
                       "fingerprint": f.fingerprint, "merged_count": f.merged_count} for f in r.findings]}
    if meta:
        d["meta"] = meta
    return d


@router.post("/reviews", status_code=201)
async def create_review(body: ReviewIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await owned_project(db, user, body.project_id)
    q = select(ProjectFile).where(ProjectFile.project_id == body.project_id)
    if body.file_ids:
        q = q.where(ProjectFile.id.in_(body.file_ids))
    all_files = (await db.scalars(q)).all()
    files, skipped = select_files(list(all_files), explicit=bool(body.file_ids), depth=body.depth)
    if not files:
        raise AppError("No reviewable files found. Add source files or select files explicitly.", code="no_files")
    provider = await resolve_provider(db, user, body.provider, body.model)
    review, meta = await run_review(db, user, provider, body.project_id, files, body.depth, skipped)
    await db.commit()
    await db.refresh(review, ["findings"])
    return _out(review, meta)


@router.get("/reviews", response_model=Page[dict])
async def list_reviews(project_id: uuid.UUID | None = None, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                       user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    cond = [CodeReview.user_id == user.id] + ([CodeReview.project_id == project_id] if project_id else [])
    total = await db.scalar(select(func.count(CodeReview.id)).where(*cond))
    rows = (await db.scalars(select(CodeReview).options(selectinload(CodeReview.findings)).where(*cond)
                             .order_by(CodeReview.created_at.desc()).offset((page - 1) * page_size).limit(page_size))).all()
    items = []
    for r in rows:
        d = _out(r)
        counts: dict[str, int] = {}
        for f in d.pop("findings"):
            counts[f["severity"]] = counts.get(f["severity"], 0) + 1
        items.append(d | {"counts": counts})
    return Page(items=items, total=total or 0, page=page, page_size=page_size)


@router.get("/reviews/{review_id}")
async def get_review(review_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    r = await db.scalar(select(CodeReview).options(selectinload(CodeReview.findings))
                        .where(CodeReview.id == review_id, CodeReview.user_id == user.id))
    if not r:
        raise NotFound("Review not found.")
    return _out(r)


@router.delete("/reviews/{review_id}", status_code=204)
async def delete_review(review_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    r = await db.scalar(select(CodeReview).where(CodeReview.id == review_id, CodeReview.user_id == user.id))
    if not r:
        raise NotFound("Review not found.")
    await db.delete(r)
    await db.commit()


class BaselineIn(BaseModel):
    is_baseline: bool = True
    label: str = Field(default="", max_length=120)


async def _owned_review(db: AsyncSession, user: User, rid: uuid.UUID) -> CodeReview:
    r = await db.scalar(select(CodeReview).options(selectinload(CodeReview.findings))
                        .where(CodeReview.id == rid, CodeReview.user_id == user.id))
    if not r:
        raise NotFound("Review not found.")
    return r


@router.post("/reviews/{review_id}/baseline")
async def set_baseline(review_id: uuid.UUID, body: BaselineIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Marks a saved review as a baseline to compare later reviews against."""
    r = await _owned_review(db, user, review_id)
    r.is_baseline, r.label = body.is_baseline, body.label.strip()
    await db.commit()
    return _out(r)


def _brief(f) -> dict:
    return {"fingerprint": f.fingerprint, "severity": f.severity, "category": f.category, "file_path": f.file_path,
            "line_start": f.line_start, "title": f.title, "source": f.source, "rule_id": f.rule_id}


@router.get("/reviews/{review_id}/compare/{other_id}")
async def compare_reviews(review_id: uuid.UUID, other_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Compares an older review (`review_id`, the baseline) with a newer one (`other_id`) by stable finding fingerprints.
    Fingerprints ignore line numbers, so findings that merely moved are reported as unchanged."""
    base, new = await _owned_review(db, user, review_id), await _owned_review(db, user, other_id)
    if base.project_id != new.project_id:
        from app.core.errors import AppError
        raise AppError("Reviews must belong to the same project.", code="different_projects")
    bmap = {f.fingerprint: f for f in base.findings if f.fingerprint}
    nmap = {f.fingerprint: f for f in new.findings if f.fingerprint}
    only_scope = set(base.scope) & set(new.scope)  # only judge files both reviews covered
    new_f = [_brief(f) for k, f in nmap.items() if k not in bmap and (f.file_path in only_scope or not f.file_path)]
    resolved = [_brief(f) for k, f in bmap.items() if k not in nmap and (f.file_path in only_scope or not f.file_path)]
    unchanged = [_brief(f) for k, f in nmap.items() if k in bmap]
    return {"baseline": {"id": str(base.id), "label": base.label, "created_at": base.created_at, "depth": base.depth},
            "current": {"id": str(new.id), "created_at": new.created_at, "depth": new.depth},
            "new": new_f, "resolved": resolved, "unchanged": unchanged,
            "compared_files": sorted(only_scope),
            "notes": ["Findings are matched by file, rule/category and text, not by line number.",
                      "Files reviewed in only one of the two reviews are excluded from the comparison.",
                      "A finding missing from the newer review may be fixed or may simply not have been reported by the AI this time."]
            + (["The two reviews used different depths, so differences may reflect review thoroughness."] if base.depth != new.depth else [])}


@router.get("/reviews/{review_id}/export.md", response_class=PlainTextResponse)
async def export_review(review_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    r = await _owned_review(db, user, review_id)
    md = [f"# Code review ({r.depth})", "",
          f"- Created: {r.created_at:%Y-%m-%d %H:%M} UTC\n- Provider/model: {r.provider} / {r.model}\n- Files: {', '.join(r.scope) or 'none'}"
          + (f"\n- Baseline: {r.label or 'yes'}" if r.is_baseline else ""), "",
          "> Findings marked *tool-confirmed* come from deterministic tools. All others are AI hypotheses.", "", "## Summary", r.summary, ""]
    order = ["critical", "high", "medium", "low", "info"]
    for sev in order:
        group = [f for f in r.findings if f.severity == sev]
        if not group:
            continue
        md.append(f"## {'Informational' if sev == 'info' else sev.title()} ({len(group)})")
        for f in group:
            loc = f"{f.file_path}:{f.line_start}" if f.line_start else (f.file_path or "project")
            tag = "tool-confirmed" if f.source == "tool" or f.tool_confirmed else "AI hypothesis"
            md += [f"### {f.title or f.description[:80]}", f"- Location: `{loc}`" + ("" if f.line_start or not f.file_path else " (line not verified)"),
                   f"- Category: {f.category} · Source: {tag}" + (f" · also reported by AI ×{f.merged_count}" if f.merged_count else ""), "", f.description]
            if f.evidence:
                fence = "```"
                while fence in f.evidence:
                    fence += "`"
                md += ["", f"{fence}\n{f.evidence}\n{fence}"]
            if f.remediation:
                md += ["", f"**Remediation:** {f.remediation}"]
            md.append("")
    if r.limitations:
        md += ["## Scope and limitations"] + [f"- {x}" for x in r.limitations]
    return "\n".join(md)
