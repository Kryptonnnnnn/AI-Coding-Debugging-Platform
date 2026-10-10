from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user
from app.core.db import get_db
from app.models.models import (CodePatch, CodeReview, CodeReviewFinding, DebuggingReport, GeneratedTest, Project, ProjectFile,
                               UsageEvent, User)

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard")
async def dashboard(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    async def count(model, *cond):
        return await db.scalar(select(func.count()).select_from(model).where(*cond)) or 0

    pids = select(Project.id).where(Project.owner_id == user.id)
    totals = {
        "projects": await count(Project, Project.owner_id == user.id, Project.archived.is_(False)),
        "files": await count(ProjectFile, ProjectFile.project_id.in_(pids)),
        "debug_reports": await count(DebuggingReport, DebuggingReport.user_id == user.id),
        "reviews": await count(CodeReview, CodeReview.user_id == user.id),
        "generated_tests": await count(GeneratedTest, GeneratedTest.user_id == user.id),
        "patches_applied": await count(CodePatch, CodePatch.user_id == user.id, CodePatch.status == "applied"),
        "patches_rejected": await count(CodePatch, CodePatch.user_id == user.id, CodePatch.status == "rejected"),
        "patches_pending": await count(CodePatch, CodePatch.user_id == user.id, CodePatch.status == "proposed"),
    }
    sev = (await db.execute(select(CodeReviewFinding.severity, func.count()).join(CodeReview, CodeReview.id == CodeReviewFinding.review_id)
                            .where(CodeReview.user_id == user.id).group_by(CodeReviewFinding.severity))).all()
    since = datetime.now(UTC) - timedelta(days=14)
    events = (await db.scalars(select(UsageEvent).where(UsageEvent.user_id == user.id, UsageEvent.created_at >= since))).all()
    by_day: dict[str, dict] = {}
    by_provider: dict[str, int] = {}
    for e in events:
        d = by_day.setdefault(e.created_at.strftime("%Y-%m-%d"), {"requests": 0, "tokens": 0})
        d["requests"] += 1
        d["tokens"] += e.prompt_tokens + e.completion_tokens
        by_provider[e.provider] = by_provider.get(e.provider, 0) + 1
    all_events = await db.execute(select(func.count(), func.coalesce(func.sum(UsageEvent.prompt_tokens + UsageEvent.completion_tokens), 0))
                                  .where(UsageEvent.user_id == user.id))
    n, tokens = all_events.one()
    return {"totals": totals, "findings_by_severity": {k: v for k, v in sev},
            "usage": {"requests": n, "tokens": int(tokens), "token_note": "Tokens are provider-reported when available, otherwise estimated (~4 chars/token).",
                      "last_14_days": [{"date": k, **v} for k, v in sorted(by_day.items())], "by_provider": by_provider}}
