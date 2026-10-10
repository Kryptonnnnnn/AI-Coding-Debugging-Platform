import posixpath
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user, owned_file, owned_project
from app.core.db import get_db
from app.core.errors import NotFound
from app.models.models import GeneratedTest, ProjectFile, User
from app.patching.engine import make_diff
from app.schemas.common import Page, SaveTestIn, TestGenIn
from app.services import project_files as pf
from app.services.ai_gateway import resolve_provider
from app.services.files import normalize_path
from app.services.testgen import generate_tests

router = APIRouter(tags=["test-generation"])


def _out(t: GeneratedTest, existing: str = "", meta: dict | None = None) -> dict:
    d = {"id": str(t.id), "project_id": str(t.project_id), "file_id": str(t.file_id) if t.file_id else None,
         "framework": t.framework, "test_path": t.test_path, "code": t.code, "description": t.description, "details": t.details,
         "saved": t.saved, "executed": t.executed, "provider": t.provider, "model": t.model, "created_at": t.created_at,
         "status_label": "Executed" if t.executed else "Generated, not executed",
         "diff": make_diff(existing, t.code, t.test_path)}
    if meta:
        d["meta"] = meta
    return d


async def _existing(db: AsyncSession, t: GeneratedTest) -> str:
    f = await db.scalar(select(ProjectFile).where(ProjectFile.project_id == t.project_id, ProjectFile.path == t.test_path))
    return f.content if f else ""


@router.post("/tests/generate", status_code=201)
async def generate(body: TestGenIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await owned_project(db, user, body.project_id)
    f = await owned_file(db, user, body.file_id, body.project_id)
    has_jest = bool(await db.scalar(select(ProjectFile.id).where(
        ProjectFile.project_id == body.project_id, ProjectFile.path == "package.json", ProjectFile.content.like("%jest%"))))
    provider = await resolve_provider(db, user, body.provider, body.model)
    rec, meta = await generate_tests(db, user, provider, f, body.framework, has_jest)
    await db.commit()
    return _out(rec, await _existing(db, rec), meta)


@router.get("/tests", response_model=Page[dict])
async def list_tests(project_id: uuid.UUID | None = None, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                     user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    cond = [GeneratedTest.user_id == user.id] + ([GeneratedTest.project_id == project_id] if project_id else [])
    total = await db.scalar(select(func.count(GeneratedTest.id)).where(*cond))
    rows = (await db.scalars(select(GeneratedTest).where(*cond).order_by(GeneratedTest.created_at.desc())
                             .offset((page - 1) * page_size).limit(page_size))).all()
    return Page(items=[_out(t) for t in rows], total=total or 0, page=page, page_size=page_size)


async def _owned(db: AsyncSession, user: User, tid: uuid.UUID) -> GeneratedTest:
    t = await db.scalar(select(GeneratedTest).where(GeneratedTest.id == tid, GeneratedTest.user_id == user.id))
    if not t:
        raise NotFound("Generated test not found.")
    return t


@router.get("/tests/{test_id}")
async def get_test(test_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    t = await _owned(db, user, test_id)
    return _out(t, await _existing(db, t))


@router.post("/tests/{test_id}/save")
async def save_test(test_id: uuid.UUID, body: SaveTestIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    t = await _owned(db, user, test_id)
    project = await owned_project(db, user, t.project_id)
    path = normalize_path(body.path) if body.path else t.test_path
    existing = await db.scalar(select(ProjectFile).where(ProjectFile.project_id == t.project_id, ProjectFile.path == path))
    if existing:
        if not body.overwrite:
            from app.core.errors import Conflict
            raise Conflict(f"'{path}' already exists. Set overwrite=true to replace it (previous content is kept in history).",
                           code="duplicate_file")
        await pf.set_content(db, existing, t.code, "edit")
        file = existing
    else:
        file = await pf.create_file(db, project, path, t.code)
    t.saved = True
    t.test_path = path
    await db.commit()
    return {"saved": True, "file_id": str(file.id), "path": path, "dir": posixpath.dirname(path)}
