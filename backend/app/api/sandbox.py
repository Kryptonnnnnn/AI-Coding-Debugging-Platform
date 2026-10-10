import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user, owned_file, owned_project, user_rate_limit
from app.core.config import get_settings
from app.core.db import get_db
from app.core.errors import AppError, NotFound
from app.models.models import ExecutionJob, ExecutionResult, User
from app.sandbox.docker_sandbox import SUPPORTED, get_sandbox
from app.schemas.common import ExecuteIn
from app.services.execution import spawn

router = APIRouter(tags=["sandbox"])


@router.get("/sandbox/status")
async def sandbox_status(user: User = Depends(current_user)):
    st = await get_sandbox().status()
    s = get_settings()
    return {"available": st.available, "provider": st.provider, "reason": st.reason, "supported_languages": sorted(SUPPORTED),
            "limits": {"timeout_seconds": s.sandbox_timeout_seconds, "memory_mb": s.sandbox_memory_mb, "cpus": s.sandbox_cpus,
                       "pids": s.sandbox_pids, "max_output_bytes": s.sandbox_max_output_bytes, "network": "none"}}


def _job_out(j: ExecutionJob, r: ExecutionResult | None) -> dict:
    d = {"id": str(j.id), "project_id": str(j.project_id), "file_path": j.file_path, "language": j.language, "kind": j.kind,
         "status": j.status, "created_at": j.created_at, "finished_at": j.finished_at, "result": None}
    if r:
        d["result"] = {"exit_code": r.exit_code, "stdout": r.stdout, "stderr": r.stderr, "timed_out": r.timed_out,
                       "truncated": r.truncated, "duration_ms": r.duration_ms}
    return d


@router.post("/projects/{project_id}/executions", status_code=202,
             dependencies=[Depends(user_rate_limit("exec", "execution_rate_limit_per_minute"))])
async def submit(project_id: uuid.UUID, body: ExecuteIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await owned_project(db, user, project_id)
    st = await get_sandbox().status()
    if not st.available:  # fail closed; no fake results
        raise AppError(f"Code execution is disabled: {st.reason}", status_code=503, code="execution_disabled")
    f = await owned_file(db, user, body.file_id, project_id)
    if f.language not in SUPPORTED:
        raise AppError(f"Execution is not supported for {f.language}.", code="unsupported_language")
    job = ExecutionJob(user_id=user.id, project_id=project_id, file_path=f.path, language=f.language, kind=body.kind,
                       expires_at=datetime.now(UTC) + timedelta(days=get_settings().execution_job_retention_days))
    db.add(job)
    await db.commit()
    spawn(job.id)
    return _job_out(job, None)


@router.get("/executions/{job_id}")
async def get_job(job_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    j = await db.scalar(select(ExecutionJob).where(ExecutionJob.id == job_id, ExecutionJob.user_id == user.id))
    if not j:
        raise NotFound("Execution job not found.")
    r = await db.scalar(select(ExecutionResult).where(ExecutionResult.job_id == j.id))
    return _job_out(j, r)


@router.get("/executions")
async def list_jobs(project_id: uuid.UUID | None = None, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    q = select(ExecutionJob).where(ExecutionJob.user_id == user.id).order_by(ExecutionJob.created_at.desc()).limit(50)
    if project_id:
        q = q.where(ExecutionJob.project_id == project_id)
    jobs = (await db.scalars(q)).all()
    out = []
    for j in jobs:
        r = await db.scalar(select(ExecutionResult).where(ExecutionResult.job_id == j.id))
        out.append(_job_out(j, r))
    return out
