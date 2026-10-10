import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import Conflict
from app.models.models import FileVersion, Project, ProjectFile
from app.services.files import check_file_size, normalize_path, sha
from app.services.languages import detect_language


async def _project_usage(db: AsyncSession, project_id: uuid.UUID) -> tuple[int, int]:
    row = (await db.execute(
        select(func.count(ProjectFile.id), func.coalesce(func.sum(ProjectFile.size_bytes), 0)).where(ProjectFile.project_id == project_id)
    )).one()
    return int(row[0]), int(row[1])


async def _add_version(db: AsyncSession, f: ProjectFile, reason: str, patch_id: uuid.UUID | None = None) -> FileVersion:
    last = await db.scalar(select(func.max(FileVersion.version_no)).where(FileVersion.file_id == f.id))
    v = FileVersion(project_id=f.project_id, file_id=f.id, version_no=(last or 0) + 1, path=f.path,
                    content=f.content, sha256=f.sha256, reason=reason, patch_id=patch_id)
    db.add(v)
    return v


async def create_file(db: AsyncSession, project: Project, path: str, content: str, language: str | None = None,
                      reason: str = "create") -> ProjectFile:
    path = normalize_path(path)
    size = check_file_size(content)
    if await db.scalar(select(ProjectFile.id).where(ProjectFile.project_id == project.id, ProjectFile.path == path)):
        raise Conflict(f"A file named '{path}' already exists.", code="duplicate_file")
    count, total = await _project_usage(db, project.id)
    s = get_settings()
    if count >= s.max_project_files or total + size > s.max_project_bytes:
        raise Conflict("Project size limit reached.", status_code=413, code="project_too_large")
    f = ProjectFile(project_id=project.id, path=path, content=content, size_bytes=size, sha256=sha(content),
                    language=language or detect_language(path, content))
    db.add(f)
    await db.flush()
    await _add_version(db, f, reason)
    return f


async def set_content(db: AsyncSession, f: ProjectFile, content: str, reason: str, patch_id: uuid.UUID | None = None) -> bool:
    """Single write path for content changes. Ensures the pre-change content is in history, then snapshots the new one."""
    size = check_file_size(content)
    new_sha = sha(content)
    if new_sha == f.sha256:
        return False
    latest = await db.scalar(
        select(FileVersion).where(FileVersion.file_id == f.id).order_by(FileVersion.version_no.desc()).limit(1)
    )
    if latest is None or latest.sha256 != f.sha256:
        await _add_version(db, f, "baseline")
    f.content, f.size_bytes, f.sha256 = content, size, new_sha
    await db.flush()
    await _add_version(db, f, reason, patch_id)
    return True


async def rename_file(db: AsyncSession, f: ProjectFile, new_path: str) -> None:
    new_path = normalize_path(new_path)
    if new_path == f.path:
        return
    if await db.scalar(select(ProjectFile.id).where(ProjectFile.project_id == f.project_id, ProjectFile.path == new_path)):
        raise Conflict(f"A file named '{new_path}' already exists.", code="duplicate_file")
    f.path = new_path
    f.language = detect_language(new_path, f.content) if f.language == "text" else f.language
