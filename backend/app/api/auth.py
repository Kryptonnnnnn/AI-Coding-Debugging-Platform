from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import client_key, current_user
from app.core.config import get_settings
from app.core.db import get_db
from app.core.errors import AppError, Unauthorized
from app.core.ratelimit import limiter
from app.core.security import create_token, hash_password, verify_password
from app.models.models import User, UserSettings
from app.schemas.common import LoginIn, RegisterIn, TokenOut, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])
_DUMMY = hash_password("not-a-real-password")  # constant-time-ish login for unknown emails


@router.post("/register", response_model=TokenOut, status_code=201)
async def register(body: RegisterIn, request: Request, db: AsyncSession = Depends(get_db)):
    limiter.check(f"auth:{client_key(request)}", get_settings().auth_rate_limit_per_minute)
    email = body.email.lower()
    if await db.scalar(select(User.id).where(User.email == email)):
        raise AppError("An account with this email already exists.", status_code=409, code="email_taken")
    user = User(email=email, password_hash=hash_password(body.password), display_name=body.display_name or email.split("@")[0])
    db.add(user)
    await db.flush()
    db.add(UserSettings(user_id=user.id))
    await db.commit()
    return TokenOut(access_token=create_token(user.id), user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenOut)
async def login(body: LoginIn, request: Request, db: AsyncSession = Depends(get_db)):
    limiter.check(f"auth:{client_key(request)}", get_settings().auth_rate_limit_per_minute)
    user = await db.scalar(select(User).where(User.email == body.email.lower()))
    ok = verify_password(body.password, user.password_hash if user else _DUMMY)
    if not user or not ok:
        raise Unauthorized("Incorrect email or password.")
    return TokenOut(access_token=create_token(user.id), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(current_user)):
    return user
