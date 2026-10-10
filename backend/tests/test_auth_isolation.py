import pytest

from tests.conftest import make_user


async def test_register_login_me(client):
    h = await make_user(client)
    assert (await client.get("/auth/me", headers=h)).json()["email"] == "a@example.com"
    r = await client.post("/auth/login", json={"email": "a@example.com", "password": "correct-horse-1"})
    assert r.status_code == 200
    bad = await client.post("/auth/login", json={"email": "a@example.com", "password": "wrong-password"})
    assert bad.status_code == 401


async def test_duplicate_email_and_weak_password(client):
    await make_user(client)
    r = await client.post("/auth/register", json={"email": "A@example.com", "password": "another-pass-1"})
    assert r.status_code == 409
    r = await client.post("/auth/register", json={"email": "b@example.com", "password": "short"})
    assert r.status_code == 422


async def test_protected_endpoints_require_auth(client):
    for path in ("/projects", "/dashboard", "/reports", "/settings", "/conversations", "/patches"):
        assert (await client.get(path)).status_code == 401
    assert (await client.get("/projects", headers={"Authorization": "Bearer garbage"})).status_code == 401


async def test_password_not_stored_plaintext(client):
    from sqlalchemy import select
    from app.core.db import get_sessionmaker
    from app.models.models import User
    await make_user(client)
    async with get_sessionmaker()() as db:
        u = await db.scalar(select(User))
        assert "correct-horse-1" not in u.password_hash and u.password_hash.startswith("$argon2")


async def test_cross_user_isolation(client, auth, project, buggy_file):
    other = await make_user(client, "b@example.com")
    pid, fid = project["id"], buggy_file["id"]
    assert (await client.get("/projects", headers=other)).json()["total"] == 0
    for method, url, kw in [
        ("get", f"/projects/{pid}", {}),
        ("patch", f"/projects/{pid}", {"json": {"name": "x"}}),
        ("delete", f"/projects/{pid}", {}),
        ("get", f"/projects/{pid}/files", {}),
        ("get", f"/projects/{pid}/files/{fid}", {}),
        ("put", f"/projects/{pid}/files/{fid}", {"json": {"content": "evil"}}),
        ("get", f"/projects/{pid}/files/{fid}/versions", {}),
        ("get", f"/projects/{pid}/search?q=sum", {}),
        ("post", f"/projects/{pid}/context-preview", {"json": {"file_ids": [fid]}}),
    ]:
        r = await getattr(client, method)(url, headers=other, **kw)
        assert r.status_code == 404, (method, url, r.status_code)
    # AI-backed endpoints must not read another user's file either
    assert (await client.post("/debug", headers=other, json={"project_id": pid, "file_id": fid})).status_code == 404
    assert (await client.post("/reviews", headers=other, json={"project_id": pid})).status_code == 404
    assert (await client.post("/tests/generate", headers=other, json={"project_id": pid, "file_id": fid})).status_code == 404
    assert (await client.post("/patches", headers=other, json={"file_id": fid, "proposed_content": "x"})).status_code == 404
    # owner still sees everything unchanged
    assert (await client.get(f"/projects/{pid}/files/{fid}", headers=auth)).json()["content"].startswith("def average")


async def test_cross_user_reports_patches_conversations(client, auth, project, buggy_file):
    r = await client.post("/debug", headers=auth, json={"project_id": project["id"], "file_id": buggy_file["id"]})
    assert r.status_code == 201
    rid, patch_id = r.json()["id"], r.json()["patch_id"]
    conv = (await client.post("/conversations", headers=auth, json={"project_id": project["id"]})).json()
    other = await make_user(client, "c@example.com")
    assert (await client.get(f"/reports/{rid}", headers=other)).status_code == 404
    assert (await client.get(f"/reports/{rid}/export.md", headers=other)).status_code == 404
    assert (await client.get(f"/patches/{patch_id}", headers=other)).status_code == 404
    assert (await client.post(f"/patches/{patch_id}/apply", headers=other)).status_code == 404
    assert (await client.get(f"/conversations/{conv['id']}/messages", headers=other)).status_code == 404
    assert (await client.post("/conversations", headers=other, json={"project_id": project["id"]})).status_code == 404
    assert (await client.get("/reports", headers=other)).json()["total"] == 0
