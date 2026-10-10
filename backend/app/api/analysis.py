import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user, owned_file, owned_project
from app.core.db import get_db
from app.core.errors import AppError
from app.models.models import ProjectFile, User
from app.schemas.common import AnalyzeIn, ContextPreviewIn, DetectIn
from app.services.context import build_context
from app.services.languages import SUPPORTED, detect_language
from app.static_analysis.service import analyze

router = APIRouter(tags=["analysis"])


@router.post("/analysis/detect-language")
async def detect(body: DetectIn, user: User = Depends(current_user)):
    lang = detect_language(body.path, body.content)
    return {"language": lang, "supported": lang in SUPPORTED}


@router.post("/analysis/static")
async def static(body: AnalyzeIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    if body.file_id:
        f = await owned_file(db, user, body.file_id)
        path, content, lang = f.path, f.content, f.language
    elif body.content is not None:
        if len(body.content.encode()) > 512 * 1024:
            raise AppError("Content too large.", status_code=413, code="file_too_large")
        path, content = body.path, body.content
        lang = body.language or detect_language(path, content)
    else:
        raise AppError("Provide file_id or content.", code="missing_input")
    return (await analyze(path, content, lang, security=body.security)).model_dump()


@router.post("/projects/{project_id}/context-preview")
async def context_preview(project_id: uuid.UUID, body: ContextPreviewIn, user: User = Depends(current_user),
                          db: AsyncSession = Depends(get_db)):
    """Shows exactly which files (and how many characters) would be sent to the AI provider."""
    await owned_project(db, user, project_id)
    files = []
    if body.file_ids:
        files = (await db.scalars(select(ProjectFile).where(ProjectFile.project_id == project_id,
                                                            ProjectFile.id.in_(body.file_ids)))).all()
    ctx = build_context(list(files))
    return ctx.summary() | {"external": body.provider == "groq"}
