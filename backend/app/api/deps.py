import uuid

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.errors import NotFound, Unauthorized
from app.core.ratelimit import limiter
from app.core.security import decode_token
from app.models.models import Project, ProjectFile, User

bearer = HTTPBearer(auto_error=False)


async def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer), db: AsyncSession = Depends(get_db)
) -> User:
    if not creds:
        raise Unauthorized("Authentication required.")
    uid = decode_token(creds.credentials)
    user = await db.get(User, uid) if uid else None
    if not user:
        raise Unauthorized("Invalid or expired token.")
    return user


async def owned_project(db: AsyncSession, user: User, project_id: uuid.UUID) -> Project:
    """Ownership is enforced here, server-side. Other users' projects look like 404s."""
    p = await db.scalar(select(Project).where(Project.id == project_id, Project.owner_id == user.id))
    if not p:
        raise NotFound("Project not found.")
    return p


async def owned_file(db: AsyncSession, user: User, file_id: uuid.UUID, project_id: uuid.UUID | None = None) -> ProjectFile:
    q = select(ProjectFile).join(Project, Project.id == ProjectFile.project_id).where(
        ProjectFile.id == file_id, Project.owner_id == user.id
    )
    if project_id:
        q = q.where(ProjectFile.project_id == project_id)
    f = await db.scalar(q)
    if not f:
        raise NotFound("File not found.")
    return f


def client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def user_rate_limit(bucket: str, limit_attr: str):
    from app.core.config import get_settings

    async def dep(user: User = Depends(current_user)) -> None:
        limiter.check(f"{bucket}:{user.id}", getattr(get_settings(), limit_attr))

    return dep
