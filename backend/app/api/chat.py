import json
import uuid

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.base import ChatMessage, Completion, estimate_tokens
from app.api.deps import current_user, owned_project
from app.core.db import get_db, get_sessionmaker
from app.core.errors import AppError, NotFound
from app.core.redaction import redact_secrets
from app.models.models import Conversation, Message, ProjectFile, UsageEvent, User
from app.schemas.common import ConversationCreate, ConversationOut, ConversationUpdate, MessageIn, MessageOut, Page
from app.services.ai_gateway import record_usage, resolve_provider, system_message
from app.services.context import SYSTEM_RULES, build_context

router = APIRouter(tags=["chat"])
HISTORY_TURNS = 10


async def _owned(db: AsyncSession, user: User, cid: uuid.UUID) -> Conversation:
    c = await db.scalar(select(Conversation).where(Conversation.id == cid, Conversation.user_id == user.id))
    if not c:
        raise NotFound("Conversation not found.")
    return c


@router.post("/conversations", response_model=ConversationOut, status_code=201)
async def create_conversation(body: ConversationCreate, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    if body.project_id:
        await owned_project(db, user, body.project_id)
    c = Conversation(user_id=user.id, project_id=body.project_id, title=body.title)
    db.add(c)
    await db.commit()
    return c


@router.get("/conversations", response_model=Page[ConversationOut])
async def list_conversations(q: str = "", project_id: uuid.UUID | None = None, page: int = Query(1, ge=1),
                             page_size: int = Query(30, ge=1, le=100), user: User = Depends(current_user),
                             db: AsyncSession = Depends(get_db)):
    cond = [Conversation.user_id == user.id] + ([Conversation.project_id == project_id] if project_id else [])
    if q:
        like = f"%{q.lower()}%"
        in_msgs = select(Message.conversation_id).where(func.lower(Message.content).like(like))
        cond.append(func.lower(Conversation.title).like(like) | Conversation.id.in_(in_msgs))
    total = await db.scalar(select(func.count(Conversation.id)).where(*cond))
    rows = (await db.scalars(select(Conversation).where(*cond).order_by(Conversation.updated_at.desc())
                             .offset((page - 1) * page_size).limit(page_size))).all()
    return Page(items=[ConversationOut.model_validate(c) for c in rows], total=total or 0, page=page, page_size=page_size)


@router.patch("/conversations/{cid}", response_model=ConversationOut)
async def rename_conversation(cid: uuid.UUID, body: ConversationUpdate, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    c = await _owned(db, user, cid)
    c.title = body.title
    await db.commit()
    return c


@router.delete("/conversations/{cid}", status_code=204)
async def delete_conversation(cid: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await db.delete(await _owned(db, user, cid))
    await db.commit()


@router.get("/conversations/{cid}/messages", response_model=list[MessageOut])
async def list_messages(cid: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await _owned(db, user, cid)
    return (await db.scalars(select(Message).where(Message.conversation_id == cid).order_by(Message.created_at))).all()


async def _prepare(db: AsyncSession, user: User, c: Conversation, body: MessageIn):
    provider = await resolve_provider(db, user, body.provider, body.model)
    files: list[ProjectFile] = []
    manifest = ""
    if c.project_id:
        allf = (await db.scalars(select(ProjectFile).where(ProjectFile.project_id == c.project_id).order_by(ProjectFile.path))).all()
        manifest = "Project file list (names only):\n" + "\n".join(f.path for f in allf[:200])
        if body.file_ids:
            files = [f for f in allf if f.id in set(body.file_ids)]
    elif body.file_ids:
        raise AppError("Files can only be attached to project conversations.", code="invalid_request")
    ctx_files: list = list(files)
    if body.selection:
        ctx_files.append(("selection", body.selection))
    ctx = build_context(ctx_files, max_chars=24_000)
    hist = (await db.scalars(select(Message).where(Message.conversation_id == c.id).order_by(Message.created_at.desc())
                             .limit(HISTORY_TURNS))).all()[::-1]
    msgs = [system_message("chat", SYSTEM_RULES + "\nAnswer concisely. Use fenced code blocks. "
                           "Only reference the files provided in context.")]
    msgs += [ChatMessage(m.role, m.content) for m in hist]
    user_text = redact_secrets(body.content)
    parts = [p for p in (manifest, ctx.text, f"Question: {user_text}") if p]
    msgs.append(ChatMessage("user", "\n\n".join(parts)))
    db.add(Message(conversation_id=c.id, role="user", content=body.content, context_files=[i.__dict__ for i in ctx.included]))
    return provider, msgs, ctx


@router.post("/conversations/{cid}/messages")
async def send_message(cid: uuid.UUID, body: MessageIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    c = await _owned(db, user, cid)
    provider, msgs, ctx = await _prepare(db, user, c, body)
    text, comps = "", []
    comp = await provider.complete(msgs, max_tokens=1500)
    text, comps = comp.text, [comp]
    m = Message(conversation_id=c.id, role="assistant", content=text, context_files=[])
    db.add(m)
    usage = await record_usage(db, user.id, "chat", provider, comps)
    if c.title == "New conversation":
        c.title = body.content[:60]
    await db.commit()
    return {"message": MessageOut.model_validate(m), "context": ctx.summary(), "usage": usage}


@router.post("/conversations/{cid}/stream")
async def stream_message(cid: uuid.UUID, body: MessageIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    c = await _owned(db, user, cid)
    provider, msgs, ctx = await _prepare(db, user, c, body)
    if c.title == "New conversation":
        c.title = body.content[:60]
    await db.commit()
    user_id, conv_id = user.id, c.id
    prompt_text = "\n".join(m.content for m in msgs)

    async def gen():
        yield f"event: context\ndata: {json.dumps(ctx.summary())}\n\n"
        buf: list[str] = []
        try:
            async for piece in provider.stream(msgs, max_tokens=1500):
                buf.append(piece)
                yield f"event: token\ndata: {json.dumps(piece)}\n\n"
        except AppError as e:
            yield f"event: error\ndata: {json.dumps({'code': e.code, 'message': e.message})}\n\n"
            return
        full = "".join(buf)
        async with get_sessionmaker()() as s2:  # request-scoped session is closed once streaming starts
            s2.add(Message(conversation_id=conv_id, role="assistant", content=full, context_files=[]))
            s2.add(UsageEvent(
                user_id=user_id, kind="chat", provider=provider.name, model=provider.model,
                prompt_tokens=estimate_tokens(prompt_text), completion_tokens=estimate_tokens(full), token_source="estimate"))
            await s2.commit()
        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
