from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import factory
from app.api.deps import current_user
from app.core.config import get_settings
from app.core.db import get_db
from app.core.errors import AppError
from app.models.models import User
from app.schemas.common import SettingsOut, SettingsUpdate
from app.services.ai_gateway import get_user_settings

router = APIRouter(tags=["settings"])


@router.get("/settings", response_model=SettingsOut)
async def get_settings_ep(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    s = await get_user_settings(db, user.id)
    await db.commit()
    return s


@router.put("/settings", response_model=SettingsOut)
async def update_settings(body: SettingsUpdate, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    s = await get_user_settings(db, user.id)
    data = body.model_dump(exclude_unset=True)
    if data.get("provider") not in (None, "", *factory.PROVIDERS):
        raise AppError("Unknown provider.", code="unknown_provider")
    for k, v in data.items():
        if v is not None:
            setattr(s, k, v)
    await db.commit()
    return s


@router.get("/ai/providers")
async def providers(user: User = Depends(current_user)):
    cfg = get_settings()
    out = []
    for name in factory.PROVIDERS:
        item = {"name": name, "default_model": factory.default_model(name), "external": factory.is_external(name),
                "configured": name != "groq" or bool(cfg.groq_api_key), "is_server_default": name == cfg.ai_provider}
        if name == "ollama":
            try:
                item |= {k: v for k, v in (await factory.get_provider("ollama").health()).items() if k in ("reachable", "installed_models")}
            except AppError:
                item["reachable"] = False
        out.append(item)
    return {"providers": out,
            "data_flow": "Groq is an external service: selected file contents are sent to it (secret-like values are redacted first). "
                         "Ollama runs locally; mock never leaves the server."}
