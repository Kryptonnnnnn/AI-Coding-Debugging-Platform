import asyncio

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import get_settings
from app.core.db import Base, engine_args, normalize_url
import app.models  # noqa: F401

target_metadata = Base.metadata


def _url() -> str:
    return normalize_url(get_settings().database_url)


def run_offline() -> None:
    context.configure(url=_url(), target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def _do(conn) -> None:
    context.configure(connection=conn, target_metadata=target_metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


async def run_online() -> None:
    url, kwargs = engine_args(get_settings().database_url)
    kwargs.pop("pool_size", None), kwargs.pop("max_overflow", None)
    engine = create_async_engine(url, **kwargs)
    async with engine.connect() as conn:
        await conn.run_sync(_do)
    await engine.dispose()


if context.is_offline_mode():
    run_offline()
else:
    asyncio.run(run_online())
