from fastapi import APIRouter
from sqlalchemy import text

from app.core.config import get_settings
from app.core.db import get_sessionmaker

router = APIRouter(tags=["health"])


@router.get("/health")
async def health():
    return {"status": "ok"}


@router.get("/ready")
async def ready():
    try:
        async with get_sessionmaker()() as db:
            await db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False
    return {"status": "ready" if db_ok else "degraded", "database": db_ok, "ai_provider": get_settings().ai_provider}
