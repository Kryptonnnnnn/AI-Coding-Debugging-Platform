import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user, owned_file
from app.core.db import get_db
from app.core.errors import Conflict, NotFound
from app.models.models import CodePatch, User
from app.patching.engine import apply_unified_diff, diff_stats, make_diff, validate_proposed
from app.schemas.common import Page, PatchCreate, PatchFull, PatchOut
from app.services import project_files as pf
from app.services.files import sha

router = APIRouter(tags=["patches"])


def _out(p: CodePatch, full: bool = False):
    st = diff_stats(p.diff)
    cls = PatchFull if full else PatchOut
    o = cls.model_validate(p)
    o.added, o.removed = st.added, st.removed
    return o


async def _owned(db: AsyncSession, user: User, pid: uuid.UUID) -> CodePatch:
    p = await db.scalar(select(CodePatch).where(CodePatch.id == pid, CodePatch.user_id == user.id))
    if not p:
        raise NotFound("Patch not found.")
    return p


@router.post("/patches", response_model=PatchFull, status_code=201)
async def create_patch(body: PatchCreate, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    f = await owned_file(db, user, body.file_id)  # a patch only ever targets one owned file
    if body.unified_diff:
        proposed = apply_unified_diff(f.content, body.unified_diff)
    elif body.proposed_content is not None:
        proposed = body.proposed_content
    else:
        from app.core.errors import AppError
        raise AppError("Provide proposed_content or unified_diff.", code="missing_input")
    validate_proposed(f.content, proposed)
    p = CodePatch(user_id=user.id, project_id=f.project_id, file_id=f.id, report_id=body.report_id, title=body.title,
                  explanation=body.explanation, base_sha256=f.sha256, original_content=f.content, proposed_content=proposed,
                  diff=make_diff(f.content, proposed, f.path))
    db.add(p)
    await db.commit()
    return _out(p, True)


@router.get("/patches", response_model=Page[PatchOut])
async def list_patches(project_id: uuid.UUID | None = None, status: str = "", page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                       user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    cond = [CodePatch.user_id == user.id]
    if project_id:
        cond.append(CodePatch.project_id == project_id)
    if status:
        cond.append(CodePatch.status == status)
    total = await db.scalar(select(func.count(CodePatch.id)).where(*cond))
    rows = (await db.scalars(select(CodePatch).where(*cond).order_by(CodePatch.created_at.desc())
                             .offset((page - 1) * page_size).limit(page_size))).all()
    return Page(items=[_out(p) for p in rows], total=total or 0, page=page, page_size=page_size)


@router.get("/patches/{patch_id}", response_model=PatchFull)
async def get_patch(patch_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return _out(await _owned(db, user, patch_id), True)


@router.post("/patches/{patch_id}/apply", response_model=PatchFull)
async def apply_patch(patch_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    p = await _owned(db, user, patch_id)
    if p.status != "proposed":
        raise Conflict(f"Patch is already {p.status}.", code="patch_not_pending")
    f = await owned_file(db, user, p.file_id)
    if sha(f.content) != p.base_sha256:
        raise Conflict("The file changed after this patch was generated, so it cannot be applied cleanly. "
                       "Regenerate the fix or restore the file version it was based on.", code="patch_conflict")
    await pf.set_content(db, f, p.proposed_content, "patch_apply", p.id)
    p.status, p.resolved_at = "applied", datetime.now(UTC)
    await db.commit()
    return _out(p, True)


@router.post("/patches/{patch_id}/reject", response_model=PatchFull)
async def reject_patch(patch_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    p = await _owned(db, user, patch_id)
    if p.status != "proposed":
        raise Conflict(f"Patch is already {p.status}.", code="patch_not_pending")
    p.status, p.resolved_at = "rejected", datetime.now(UTC)
    await db.commit()
    return _out(p, True)
