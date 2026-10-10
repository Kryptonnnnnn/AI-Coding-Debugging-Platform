import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="aicp-test-")
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL") or f"sqlite+aiosqlite:///{_tmp}/test.db"
os.environ["AI_PROVIDER"] = "mock"
os.environ["EXECUTION_ENABLED"] = "false"
os.environ["RATE_LIMIT_PER_MINUTE"] = "100000"
os.environ["AUTH_RATE_LIMIT_PER_MINUTE"] = "100000"
os.environ["AI_RATE_LIMIT_PER_MINUTE"] = "100000"

import httpx  # noqa: E402
import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402

from app.ai import factory  # noqa: E402
from app.core.db import Base, get_engine, reset_engine  # noqa: E402
from app.core.ratelimit import limiter  # noqa: E402
from app.main import create_app  # noqa: E402
from app.sandbox.docker_sandbox import set_sandbox_override  # noqa: E402


@pytest_asyncio.fixture
async def client():
    await reset_engine()
    eng = get_engine()
    async with eng.begin() as c:
        await c.run_sync(Base.metadata.drop_all)
        await c.run_sync(Base.metadata.create_all)
    limiter.reset()
    app = create_app()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test/api/v1") as c:
        yield c
    factory.set_provider_override(None)
    set_sandbox_override(None)
    await reset_engine()


async def make_user(client, email="a@example.com", password="correct-horse-1"):
    r = await client.post("/auth/register", json={"email": email, "password": password})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest_asyncio.fixture
async def auth(client):
    return await make_user(client)


@pytest_asyncio.fixture
async def project(client, auth):
    r = await client.post("/projects", json={"name": "demo"}, headers=auth)
    return r.json()


BUGGY = "def average(xs):\n    return sum(xs) / len(xs)\n"


@pytest_asyncio.fixture
async def buggy_file(client, auth, project):
    r = await client.post(f"/projects/{project['id']}/files", json={"path": "calc.py", "content": BUGGY}, headers=auth)
    assert r.status_code == 201, r.text
    return r.json()
