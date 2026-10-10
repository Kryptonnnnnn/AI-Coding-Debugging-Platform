import uuid

from fastapi import APIRouter, Depends, Query
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
    d = {"id": str(r.id), "project_id": str(r.project_id) if r.project_id else None, "depth": r.depth, "scope": r.scope,
         "summary": r.summary, "limitations": r.limitations, "provider": r.provider, "model": r.model, "created_at": r.created_at,
         "findings": [{"id": str(f.id), "severity": f.severity, "category": f.category, "file_path": f.file_path,
                       "line_start": f.line_start, "line_end": f.line_end, "title": f.title, "description": f.description,
                       "evidence": f.evidence, "remediation": f.remediation, "source": f.source,
                       "tool_confirmed": f.tool_confirmed, "rule_id": f.rule_id} for f in r.findings]}
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
