import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user, owned_file
from app.core.db import get_db
from app.core.errors import Conflict, NotFound
from app.models.models import CodePatch, User
from app.patching.verification import add_event, post_apply_check, verify_patch
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
    await post_apply_check(p, f)
    await db.commit()
    return _out(p, True)


@router.post("/patches/{patch_id}/reject", response_model=PatchFull)
async def reject_patch(patch_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    p = await _owned(db, user, patch_id)
    if p.status != "proposed":
        raise Conflict(f"Patch is already {p.status}.", code="patch_not_pending")
    p.status, p.resolved_at = "rejected", datetime.now(UTC)
    add_event(p, "rejected")
    await db.commit()
    return _out(p, True)


class VerifyIn(BaseModel):
    test_paths: list[str] = Field(default_factory=list, max_length=3)


@router.post("/patches/{patch_id}/verify")
async def verify(patch_id: uuid.UUID, body: VerifyIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Parser/static checks on the proposed content (never written), plus optional sandboxed pytest runs.
    Execution is reported as `not_executed` whenever the sandbox is unavailable. A pass is never assumed."""
    p = await _owned(db, user, patch_id)
    f = await owned_file(db, user, p.file_id)
    result = await verify_patch(db, p, f, body.test_paths)
    await db.commit()
    return result


@router.get("/patches/{patch_id}/verification")
async def get_verification(patch_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    p = await _owned(db, user, patch_id)
    return p.verification or {}


@router.post("/patches/{patch_id}/regression-tests", status_code=201)
async def regression_tests(patch_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Suggests regression tests for a proposed patch (AI-generated, not executed)."""
    from sqlalchemy import select as _sel
    from app.api.tests import _out as test_out, _existing
    from app.models.models import ProjectFile
    from app.services.ai_gateway import resolve_provider
    from app.services.testgen import generate_tests
    p = await _owned(db, user, patch_id)
    f = await owned_file(db, user, p.file_id)
    has_jest = bool(await db.scalar(_sel(ProjectFile.id).where(ProjectFile.project_id == p.project_id, ProjectFile.path == "package.json",
                                                                 ProjectFile.content.like("%jest%"))))
    provider = await resolve_provider(db, user)
    rec, meta = await generate_tests(db, user, provider, f, None, has_jest, patch=p)
    add_event(p, "regression_tests_suggested", test_id=str(rec.id))
    await db.commit()
    return test_out(rec, await _existing(db, rec), meta)
