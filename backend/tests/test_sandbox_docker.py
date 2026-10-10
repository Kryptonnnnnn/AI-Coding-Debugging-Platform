"""Runs real containers. Skipped automatically when Docker or the sandbox image is unavailable.

Probes execute INSIDE the isolated container only; nothing here touches the host.
"""
import shutil
import subprocess

import pytest

from app.core.config import get_settings
from app.sandbox import docker_sandbox as ds
from app.sandbox.base import ExecRequest


def _ready() -> bool:
    if not shutil.which("docker"):
        return False
    try:
        return subprocess.run(["docker", "image", "inspect", get_settings().sandbox_image], capture_output=True, timeout=10).returncode == 0
    except Exception:
        return False


pytestmark = pytest.mark.skipif(not _ready(), reason="Docker daemon or sandbox image not available")


@pytest.fixture
def sandbox(monkeypatch):
    monkeypatch.setattr(get_settings(), "execution_enabled", True)
    monkeypatch.setattr(ds, "_cache", None)
    return ds.DockerSandbox()


def run(code: str, **kw):
    return ExecRequest(files={"main.py": code}, entry="main.py", language="python", **kw)


def leftover_containers() -> list[str]:
    out = subprocess.run(["docker", "ps", "-a", "--filter", "name=aicp-", "--format", "{{.Names}}"], capture_output=True, text=True)
    return out.stdout.split()


async def test_hello_world_and_exit_code(sandbox):
    r = await sandbox.execute(run("print('hi'); import sys; sys.exit(3)"))
    assert r.stdout.strip() == "hi" and r.exit_code == 3 and not r.timed_out


async def test_runs_as_non_root_without_secrets(sandbox, monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "gsk_should_never_appear_in_sandbox")
    r = await sandbox.execute(run("import os; print(os.getuid()); print('GROQ_API_KEY' in os.environ, 'gsk_' in repr(dict(os.environ)))"))
    uid, has_key, leaked = r.stdout.strip().splitlines()[0], *r.stdout.strip().splitlines()[1].split()
    assert uid != "0" and has_key == "False" and leaked == "False"


async def test_no_network(sandbox):
    code = "import socket\ntry:\n    socket.create_connection(('1.1.1.1', 53), timeout=3); print('CONNECTED')\nexcept OSError as e:\n    print('blocked')\n"
    assert (await sandbox.execute(run(code))).stdout.strip() == "blocked"


async def test_read_only_root_and_input_mount(sandbox):
    code = ("for p in ('/etc/x', '/work/x'):\n    try:\n        open(p, 'w').write('1'); print(p, 'WRITABLE')\n"
            "    except OSError:\n        print(p, 'ro')\nopen('/tmp/ok', 'w').write('1'); print('tmp ok')\n")
    out = (await sandbox.execute(run(code))).stdout.splitlines()
    assert out == ["/etc/x ro", "/work/x ro", "tmp ok"]


async def test_no_docker_socket_or_host_mounts(sandbox):
    code = "import os; print(os.path.exists('/var/run/docker.sock'), os.path.exists('/Users'), os.listdir('/work'))"
    assert (await sandbox.execute(run(code))).stdout.strip() == "False False ['main.py']"


async def test_timeout_kills_and_cleans_up(sandbox, monkeypatch):
    monkeypatch.setattr(get_settings(), "sandbox_timeout_seconds", 2)
    r = await sandbox.execute(run("while True: pass"))
    assert r.timed_out and r.exit_code is None
    assert leftover_containers() == []


async def test_output_is_truncated(sandbox, monkeypatch):
    monkeypatch.setattr(get_settings(), "sandbox_max_output_bytes", 1000)
    r = await sandbox.execute(run("print('x' * 100000)"))
    assert r.truncated and len(r.stdout) <= 1000


async def test_memory_limit_enforced(sandbox):
    r = await sandbox.execute(run("b = bytearray(600 * 1024 * 1024); print('allocated')"))
    assert "allocated" not in r.stdout and r.exit_code != 0


async def test_pytest_mode(sandbox):
    req = ExecRequest(files={"test_a.py": "def test_ok():\n    assert 1 + 1 == 2\n"}, entry="test_a.py", language="python", kind="test")
    r = await sandbox.execute(req)
    assert r.exit_code == 0 and "1 passed" in r.stdout
    assert leftover_containers() == []


async def test_full_api_flow_with_real_docker(monkeypatch):
    """Submit via the HTTP API and poll: the job really runs in a container."""
    import asyncio
    import httpx
    from app.core.db import Base, get_engine, reset_engine
    from app.main import create_app
    monkeypatch.setattr(get_settings(), "execution_enabled", True)
    monkeypatch.setattr(ds, "_cache", None)
    await reset_engine()
    async with get_engine().begin() as c:
        await c.run_sync(Base.metadata.drop_all)
        await c.run_sync(Base.metadata.create_all)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app()), base_url="http://t/api/v1") as cl:
        tok = (await cl.post("/auth/register", json={"email": "d@example.com", "password": "correct-horse-1"})).json()["access_token"]
        h = {"Authorization": f"Bearer {tok}"}
        assert (await cl.get("/sandbox/status", headers=h)).json()["available"] is True
        p = (await cl.post("/projects", json={"name": "x"}, headers=h)).json()
        f = (await cl.post(f"/projects/{p['id']}/files", json={"path": "m.py", "content": "print(6*7)"}, headers=h)).json()
        job = (await cl.post(f"/projects/{p['id']}/executions", json={"file_id": f["id"]}, headers=h)).json()
        for _ in range(100):
            j = (await cl.get(f"/executions/{job['id']}", headers=h)).json()
            if j["status"] in ("completed", "failed"):
                break
            await asyncio.sleep(0.2)
        assert j["status"] == "completed" and j["result"]["stdout"].strip() == "42" and j["result"]["exit_code"] == 0
    await reset_engine()
