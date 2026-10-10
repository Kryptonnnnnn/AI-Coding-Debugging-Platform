import uuid

from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user, owned_file, owned_project
from app.core.config import get_settings
from app.core.db import get_db
from app.core.errors import AppError, NotFound
from app.core.redaction import is_sensitive_path, scan_secrets
from app.models.models import FileVersion, Project, ProjectFile, User
from app.schemas.common import (FileCreate, FileMeta, FileOut, FileUpdate, Page, ProjectCreate, ProjectOut, ProjectUpdate,
                                UploadResult, VersionFull, VersionOut)
from app.services import project_files as pf
from app.services.files import decode_text, extract_zip, normalize_path
from app.services.languages import detect_language

router = APIRouter(tags=["projects"])


async def _out(db: AsyncSession, p: Project) -> ProjectOut:
    n = await db.scalar(select(func.count(ProjectFile.id)).where(ProjectFile.project_id == p.id))
    o = ProjectOut.model_validate(p)
    o.file_count = n or 0
    return o


@router.post("/projects", response_model=ProjectOut, status_code=201)
async def create_project(body: ProjectCreate, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    p = Project(owner_id=user.id, name=body.name.strip(), description=body.description, settings={})
    db.add(p)
    await db.commit()
    return await _out(db, p)


@router.get("/projects", response_model=Page[ProjectOut])
async def list_projects(q: str = "", archived: bool = False, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                        user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    cond = [Project.owner_id == user.id, Project.archived == archived]
    if q:
        like = f"%{q.lower()}%"
        cond.append(or_(func.lower(Project.name).like(like), func.lower(Project.description).like(like)))
    total = await db.scalar(select(func.count(Project.id)).where(*cond))
    rows = (await db.scalars(select(Project).where(*cond).order_by(Project.updated_at.desc())
                             .offset((page - 1) * page_size).limit(page_size))).all()
    return Page(items=[await _out(db, p) for p in rows], total=total or 0, page=page, page_size=page_size)


@router.get("/projects/{project_id}", response_model=ProjectOut)
async def get_project(project_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return await _out(db, await owned_project(db, user, project_id))


@router.patch("/projects/{project_id}", response_model=ProjectOut)
async def update_project(project_id: uuid.UUID, body: ProjectUpdate, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    p = await owned_project(db, user, project_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(p, k, v.strip() if k == "name" else v)
    await db.commit()
    return await _out(db, p)


@router.delete("/projects/{project_id}", status_code=204)
async def delete_project(project_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    p = await owned_project(db, user, project_id)
    await db.delete(p)
    await db.commit()


# ---- files
@router.get("/projects/{project_id}/files", response_model=list[FileMeta])
async def list_files(project_id: uuid.UUID, q: str = "", user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await owned_project(db, user, project_id)
    cond = [ProjectFile.project_id == project_id]
    if q:
        cond.append(func.lower(ProjectFile.path).like(f"%{q.lower()}%"))
    return (await db.scalars(select(ProjectFile).where(*cond).order_by(ProjectFile.path))).all()


@router.get("/projects/{project_id}/search")
async def search_content(project_id: uuid.UUID, q: str = Query(min_length=2, max_length=100), user: User = Depends(current_user),
                         db: AsyncSession = Depends(get_db)):
    await owned_project(db, user, project_id)
    hits = []
    for f in (await db.scalars(select(ProjectFile).where(ProjectFile.project_id == project_id).order_by(ProjectFile.path))).all():
        for n, line in enumerate(f.content.splitlines(), 1):
            if q.lower() in line.lower():
                hits.append({"file_id": str(f.id), "path": f.path, "line": n, "text": line.strip()[:200]})
                if len(hits) >= 100:
                    return hits
    return hits


def _file_out(f: ProjectFile) -> FileOut:
    o = FileOut.model_validate(f)
    o.secret_warnings = [{"line": w.line, "kind": w.kind} for w in scan_secrets(f.content)]
    if is_sensitive_path(f.path):
        o.secret_warnings.append({"line": 0, "kind": "Sensitive filename"})
    return o


@router.post("/projects/{project_id}/files", response_model=FileOut, status_code=201)
async def create_file(project_id: uuid.UUID, body: FileCreate, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    p = await owned_project(db, user, project_id)
    f = await pf.create_file(db, p, body.path, body.content, body.language)
    await db.commit()
    return _file_out(f)


@router.get("/projects/{project_id}/files/{file_id}", response_model=FileOut)
async def get_file(project_id: uuid.UUID, file_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return _file_out(await owned_file(db, user, file_id, project_id))


@router.put("/projects/{project_id}/files/{file_id}", response_model=FileOut)
async def update_file(project_id: uuid.UUID, file_id: uuid.UUID, body: FileUpdate, user: User = Depends(current_user),
                      db: AsyncSession = Depends(get_db)):
    f = await owned_file(db, user, file_id, project_id)
    if body.path is not None:
        await pf.rename_file(db, f, body.path)
    if body.language:
        f.language = body.language
    if body.content is not None:
        await pf.set_content(db, f, body.content, "edit")
    await db.commit()
    return _file_out(f)


@router.delete("/projects/{project_id}/files/{file_id}", status_code=204)
async def delete_file(project_id: uuid.UUID, file_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    f = await owned_file(db, user, file_id, project_id)
    await db.delete(f)
    await db.commit()


@router.post("/projects/{project_id}/upload", response_model=UploadResult, status_code=201)
async def upload(project_id: uuid.UUID, files: list[UploadFile] = File(...), user: User = Depends(current_user),
                 db: AsyncSession = Depends(get_db)):
    """Accepts individual source files or one ZIP. ZIPs are read in memory; nothing is extracted to disk."""
    p = await owned_project(db, user, project_id)
    s = get_settings()
    incoming: dict[str, str] = {}
    skipped: list[dict] = []
    for up in files:
        data = await up.read(max(s.max_zip_bytes, s.max_file_bytes) + 1)
        name = up.filename or ""
        if name.lower().endswith(".zip"):
            ex = extract_zip(data)
            incoming.update(ex.files)
            skipped += ex.skipped
        else:
            if len(data) > s.max_file_bytes:
                skipped.append({"path": name, "reason": "too large"})
                continue
            try:
                incoming[normalize_path(name.replace("\\", "/").split("/")[-1])] = decode_text(data)
            except AppError as e:
                skipped.append({"path": name, "reason": e.message})
    created, updated = [], []
    existing = {f.path: f for f in (await db.scalars(select(ProjectFile).where(ProjectFile.project_id == p.id))).all()}
    for path, content in incoming.items():
        if path in existing:
            await pf.set_content(db, existing[path], content, "upload")
            updated.append(path)
        else:
            await pf.create_file(db, p, path, content, reason="upload")
            created.append(path)
    await db.commit()
    return UploadResult(created=created, updated=updated, skipped=skipped)


# ---- versions
@router.get("/projects/{project_id}/files/{file_id}/versions", response_model=list[VersionOut])
async def list_versions(project_id: uuid.UUID, file_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await owned_file(db, user, file_id, project_id)
    return (await db.scalars(select(FileVersion).where(FileVersion.file_id == file_id).order_by(FileVersion.version_no.desc()))).all()


@router.get("/projects/{project_id}/files/{file_id}/versions/{version_id}", response_model=VersionFull)
async def get_version(project_id: uuid.UUID, file_id: uuid.UUID, version_id: uuid.UUID, user: User = Depends(current_user),
                      db: AsyncSession = Depends(get_db)):
    await owned_file(db, user, file_id, project_id)
    v = await db.scalar(select(FileVersion).where(FileVersion.id == version_id, FileVersion.file_id == file_id))
    if not v:
        raise NotFound("Version not found.")
    return v


@router.post("/projects/{project_id}/files/{file_id}/versions/{version_id}/restore", response_model=FileOut)
async def restore_version(project_id: uuid.UUID, file_id: uuid.UUID, version_id: uuid.UUID, user: User = Depends(current_user),
                          db: AsyncSession = Depends(get_db)):
    f = await owned_file(db, user, file_id, project_id)
    v = await db.scalar(select(FileVersion).where(FileVersion.id == version_id, FileVersion.file_id == file_id))
    if not v:
        raise NotFound("Version not found.")
    await pf.set_content(db, f, v.content, "restore")
    await db.commit()
    return _file_out(f)
