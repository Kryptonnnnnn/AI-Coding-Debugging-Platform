from collections.abc import AsyncIterator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings


_LIBPQ_ONLY = {"sslmode", "channel_binding", "sslrootcert", "options", "target_session_attrs"}


def engine_args(url: str) -> tuple[str, dict]:
    """Translate a libpq-style URL (as issued by Neon/Supabase/Render) into SQLAlchemy+asyncpg settings.

    asyncpg rejects `sslmode=` / `channel_binding=` in the query string, so they are mapped to `ssl=`.
    PgBouncer-style poolers (host contains `-pooler`) need prepared-statement caching disabled.
    """
    from sqlalchemy.engine import make_url

    u = make_url(normalize_url(url))
    kwargs: dict = {}
    if u.drivername.startswith("postgresql+asyncpg"):
        q = dict(u.query)
        mode = q.get("sslmode") or q.get("ssl")
        for k in list(q):
            if k in _LIBPQ_ONLY or k == "ssl":
                q.pop(k)
        u = u.set(query=q)
        connect_args: dict = {}
        if mode and mode not in ("disable", "allow"):
            connect_args["ssl"] = "require" if mode in ("true", "prefer") else mode
        if "-pooler" in (u.host or ""):
            connect_args["statement_cache_size"] = 0
            connect_args["prepared_statement_cache_size"] = 0
        if connect_args:
            kwargs["connect_args"] = connect_args
        kwargs.update(pool_size=5, max_overflow=5, pool_recycle=300)  # recycle: serverless DBs drop idle connections
    return u.render_as_string(hide_password=False), kwargs


def normalize_url(url: str) -> str:
    # Managed hosts hand out postgres:// or postgresql://; we need the asyncpg driver.
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+asyncpg://" + url[len("postgresql://"):]
    return url


class Base(DeclarativeBase):
    pass


_engine = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def get_engine():
    global _engine, _sessionmaker
    if _engine is None:
        url, kwargs = engine_args(get_settings().database_url)
        _engine = create_async_engine(url, pool_pre_ping=True, **kwargs)
        if url.startswith("sqlite"):

            @event.listens_for(_engine.sync_engine, "connect")
            def _fk_on(dbapi_conn, _):  # SQLite ignores foreign keys unless enabled per connection
                cur = dbapi_conn.cursor()
                cur.execute("PRAGMA foreign_keys=ON")
                cur.close()

        _sessionmaker = async_sessionmaker(_engine, expire_on_commit=False)
    return _engine


def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    get_engine()
    assert _sessionmaker is not None
    return _sessionmaker


async def get_db() -> AsyncIterator[AsyncSession]:
    async with get_sessionmaker()() as session:
        yield session


async def reset_engine() -> None:
    global _engine, _sessionmaker
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _sessionmaker = None
