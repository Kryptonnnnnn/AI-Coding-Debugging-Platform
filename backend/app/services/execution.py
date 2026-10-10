import asyncio
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select

from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.models.models import (CodeReview, Conversation, DebuggingReport, ExecutionJob, ExecutionResult, ProjectFile,
                               UserSettings)
from app.sandbox.base import ExecRequest
from app.sandbox.docker_sandbox import get_sandbox

_tasks: set[asyncio.Task] = set()


async def run_job(job_id: uuid.UUID) -> None:
    """Runs a job inside the sandbox provider (never in this process) and stores bounded output."""
    async with get_sessionmaker()() as db:
        job = await db.get(ExecutionJob, job_id)
        if not job:
            return
        job.status = "running"
        await db.commit()
        try:
            files = {f.path: f.content for f in (await db.scalars(select(ProjectFile).where(ProjectFile.project_id == job.project_id))).all()}
            out = await get_sandbox().execute(ExecRequest(files=files, entry=job.file_path, language=job.language, kind=job.kind))
            db.add(ExecutionResult(job_id=job.id, exit_code=out.exit_code, stdout=out.stdout, stderr=out.stderr,
                                   timed_out=out.timed_out, truncated=out.truncated, duration_ms=out.duration_ms))
            job.status = "completed"
        except Exception as e:  # noqa: BLE001 - record failure, never leak internals
            msg = getattr(e, "message", "Execution failed.")
            db.add(ExecutionResult(job_id=job.id, exit_code=None, stderr=str(msg)[:500]))
            job.status = "failed"
        job.finished_at = datetime.now(UTC)
        await db.commit()


def spawn(job_id: uuid.UUID) -> None:
    t = asyncio.create_task(run_job(job_id))
    _tasks.add(t)
    t.add_done_callback(_tasks.discard)


async def cleanup_expired() -> dict:
    s = get_settings()
    now = datetime.now(UTC)
    async with get_sessionmaker()() as db:
        r = await db.execute(delete(ExecutionJob).where(ExecutionJob.expires_at < now))
        # jobs stuck in queued/running for >10 minutes (e.g. after a crash) are marked failed
        stuck = (await db.scalars(select(ExecutionJob).where(ExecutionJob.status.in_(["queued", "running"]),
                                                              ExecutionJob.created_at < now - timedelta(minutes=10)))).all()
        for j in stuck:
            j.status, j.finished_at = "failed", now
        purged = await _apply_retention(db, now)
        await db.commit()
        return {"deleted_jobs": r.rowcount, "reset_stuck": len(stuck), "retention_days": s.execution_job_retention_days,
                "purged_records": purged}


async def _apply_retention(db, now: datetime) -> int:
    """Deletes saved reports/reviews/conversations older than the user's (or the server's) retention window.
    Source files and version history are never touched by retention."""
    server_days = get_settings().report_retention_days
    rows = (await db.execute(select(UserSettings.user_id, UserSettings.data_retention_days))).all()
    per_user = {uid: days for uid, days in rows if days > 0}
    purged = 0
    for model, ts in ((DebuggingReport, DebuggingReport.created_at), (CodeReview, CodeReview.created_at),
                      (Conversation, Conversation.updated_at)):
        if server_days > 0:
            purged += (await db.execute(delete(model).where(ts < now - timedelta(days=server_days)))).rowcount
        for uid, days in per_user.items():
            purged += (await db.execute(delete(model).where(model.user_id == uid, ts < now - timedelta(days=days)))).rowcount
    return purged
