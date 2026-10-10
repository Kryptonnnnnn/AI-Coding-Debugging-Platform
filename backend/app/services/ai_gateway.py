import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import factory
from app.ai.base import AIProvider, ChatMessage, Completion
from app.ai.structured import run_structured
from app.core.config import get_settings
from app.core.errors import AppError
from app.core.ratelimit import limiter
from app.models.models import UsageEvent, User, UserSettings


async def get_user_settings(db: AsyncSession, user_id: uuid.UUID) -> UserSettings:
    s = await db.scalar(select(UserSettings).where(UserSettings.user_id == user_id))
    if not s:
        s = UserSettings(user_id=user_id)
        db.add(s)
        await db.flush()
    return s


async def resolve_provider(
    db: AsyncSession, user: User, provider: str | None = None, model: str | None = None
) -> AIProvider:
    """Request override > user setting > server default. External providers need explicit acknowledgment."""
    limiter.check(f"ai:{user.id}", get_settings().ai_rate_limit_per_minute)
    us = await get_user_settings(db, user.id)
    name = provider or us.provider or get_settings().ai_provider
    mdl = model or (us.model if (not provider and us.provider == name) else "") or None
    if factory.is_external(name) and not us.external_ai_acknowledged:
        raise AppError(
            "Your code would be sent to an external AI provider (Groq). Acknowledge this in Settings first, "
            "or choose Ollama / mock.",
            status_code=403, code="external_ai_not_acknowledged",
        )
    return factory.get_provider(name, mdl)


async def record_usage(db: AsyncSession, user_id: uuid.UUID, kind: str, provider: AIProvider, comps: list[Completion]) -> dict:
    p = sum(c.prompt_tokens for c in comps)
    c_ = sum(c.completion_tokens for c in comps)
    src = "provider" if comps and all(c.token_source == "provider" for c in comps) else "estimate"
    db.add(UsageEvent(user_id=user_id, kind=kind, provider=provider.name, model=provider.model,
                      prompt_tokens=p, completion_tokens=c_, token_source=src))
    return {"prompt_tokens": p, "completion_tokens": c_, "source": src}


def system_message(task: str, rules: str, schema_json: str | None = None) -> ChatMessage:
    text = f"[[TASK:{task}]]\n{rules}"
    if schema_json:
        text += f"\nRespond with ONLY one JSON object conforming to this JSON Schema:\n{schema_json}"
    return ChatMessage("system", text)


__all__ = ["resolve_provider", "record_usage", "system_message", "run_structured"]
