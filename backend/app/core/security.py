import asyncio
import uuid
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

from app.core.config import get_settings

_ph = PasswordHasher()


def hash_password(pw: str) -> str:
    return _ph.hash(pw)


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return _ph.verify(hashed, pw)
    except (VerifyMismatchError, InvalidHashError):
        return False


def create_token(user_id: uuid.UUID) -> str:
    s = get_settings()
    now = datetime.now(UTC)
    payload = {"sub": str(user_id), "iat": now, "exp": now + timedelta(minutes=s.access_token_minutes)}
    return jwt.encode(payload, s.secret_key, algorithm="HS256")


def decode_token(token: str) -> uuid.UUID | None:
    try:
        data = jwt.decode(token, get_settings().secret_key, algorithms=["HS256"])
        return uuid.UUID(data["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None


async def hash_password_async(pw: str) -> str:
    """Argon2 is CPU-heavy (seconds on small hosts); run it off the event loop so other requests keep flowing."""
    return await asyncio.to_thread(hash_password, pw)


async def verify_password_async(pw: str, hashed: str) -> bool:
    return await asyncio.to_thread(verify_password, pw, hashed)
