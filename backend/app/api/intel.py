import uuid
from collections import Counter

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user, owned_file, owned_project
from app.code_intel.graph import build_graph, related
from app.code_intel.retrieval import rank_files
from app.core.db import get_db
from app.models.models import (CodePatch, CodeReview, CodeReviewFinding, CodeSession, DebuggingReport, FileVersion, GeneratedTest, ProjectFile, User)
from app.schemas.common import RetrieveIn
from app.services.context import is_auto_excluded

router = APIRouter(tags=["code-intelligence"])


async def _files(db: AsyncSession, project_id: uuid.UUID) -> list[ProjectFile]:
    return list((await db.scalars(select(ProjectFile).where(ProjectFile.project_id == project_id).order_by(ProjectFile.path))).all())


@router.get("/projects/{project_id}/graph")
async def graph(project_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await owned_project(db, user, project_id)
    files = [f for f in await _files(db, project_id) if not is_auto_excluded(f.path)]
    return build_graph([(f.path, f.language, f.content) for f in files])


@router.get("/projects/{project_id}/files/{file_id}/related")
async def file_related(project_id: uuid.UUID, file_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    f = await owned_file(db, user, file_id, project_id)
    g = build_graph([(x.path, x.language, x.content) for x in await _files(db, project_id) if not is_auto_excluded(x.path)])
    node = next((n for n in g["nodes"] if n["path"] == f.path), None)
    return {"path": f.path, "supported": bool(node and node["supported"]), "language": f.language, "method": g["method"].get(f.language),
            "imports": node["imports"] if node else [], "imported_by": node["imported_by"] if node else [],
            "external": node["external"] if node else [], "unresolved": node["unresolved"] if node else [],
            "cycles": [c for c in g["cycles"] if f.path in c], "disclaimer": g["disclaimer"],
            "suggested_context": related(g, f.path) if node else []}


@router.post("/projects/{project_id}/retrieve")
async def retrieve(project_id: uuid.UUID, body: RetrieveIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Ranks project files by lexical relevance to a question. Nothing is sent to an AI provider."""
    await owned_project(db, user, project_id)
    files = [f for f in await _files(db, project_id) if not is_auto_excluded(f.path)]
    by_path = {f.path: f for f in files}
    ranked = rank_files(body.question, [(f.path, f.content) for f in files], body.limit)
    return {"method": "keyword ranking (paths, definitions, term frequency); not semantic embeddings",
            "results": [{**r, "file_id": str(by_path[r["path"]].id), "language": by_path[r["path"]].language} for r in ranked],
            "excluded": "Secret/dependency files are never suggested."}


@router.get("/projects/{project_id}/overview")
async def overview(project_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Real statistics computed from stored data. Nothing is estimated or synthetic."""
    await owned_project(db, user, project_id)
    files = await _files(db, project_id)
    lang: dict[str, dict] = {}
    for f in files:
        d = lang.setdefault(f.language, {"language": f.language, "files": 0, "bytes": 0})
        d["files"] += 1
        d["bytes"] += f.size_bytes
    cnt = lambda m, *c: func.count().select_from(m).where(*c)  # noqa: E731
    async def n(m, *c):
        return await db.scalar(select(func.count()).select_from(m).where(*c)) or 0
    patch_rows = (await db.execute(select(CodePatch.status, func.count()).where(CodePatch.project_id == project_id).group_by(CodePatch.status))).all()
    latest = await db.scalar(select(CodeReview).where(CodeReview.project_id == project_id, CodeReview.user_id == user.id).order_by(CodeReview.created_at.desc()).limit(1))
    per_file_findings: Counter = Counter()
    sev: Counter = Counter()
    if latest:
        for fnd in (await db.scalars(select(CodeReviewFinding).where(CodeReviewFinding.review_id == latest.id))).all():
            sev[fnd.severity] += 1
            if fnd.file_path:
                per_file_findings[fnd.file_path] += 1
    versions = (await db.execute(select(FileVersion.path, func.count()).where(FileVersion.project_id == project_id).group_by(FileVersion.path)
                                 .order_by(func.count().desc()).limit(5))).all()
    g = build_graph([(f.path, f.language, f.content) for f in files if not is_auto_excluded(f.path)])
    activity = (await db.scalars(select(CodeSession).where(CodeSession.project_id == project_id, CodeSession.user_id == user.id)
                                 .order_by(CodeSession.created_at.desc()).limit(10))).all()
    most_imported = sorted(g["nodes"], key=lambda x: -len(x["imported_by"]))[:5]
    return {
        "files": len(files), "bytes": sum(f.size_bytes for f in files),
        "languages": sorted(lang.values(), key=lambda d: -d["bytes"]),
        "activity_counts": {"debug_reports": await n(DebuggingReport, DebuggingReport.project_id == project_id),
                            "reviews": await n(CodeReview, CodeReview.project_id == project_id),
                            "generated_tests": await n(GeneratedTest, GeneratedTest.project_id == project_id),
                            "patches": {s: c for s, c in patch_rows}},
        "latest_review": {"id": str(latest.id), "created_at": latest.created_at, "depth": latest.depth, "findings_by_severity": dict(sev),
                          "files_with_most_findings": per_file_findings.most_common(5)} if latest else None,
        "most_edited_files": [{"path": p, "versions": c} for p, c in versions],
        "imports": {"edges": g["edges"], "cycles": len(g["cycles"]), "most_imported": [{"path": x["path"], "imported_by": len(x["imported_by"])} for x in most_imported if x["imported_by"]]},
        "recent_activity": [{"id": str(s.id), "kind": s.kind, "title": s.title, "ref_id": str(s.ref_id) if s.ref_id else None, "created_at": s.created_at} for s in activity],
    }
