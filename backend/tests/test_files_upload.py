import io
import zipfile

from app.services.languages import detect_language


def make_zip(entries: dict[str, bytes | str], symlink: str | None = None) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for name, data in entries.items():
            z.writestr(name, data)
        if symlink:
            info = zipfile.ZipInfo(symlink)
            info.external_attr = (0o120777 << 16)
            z.writestr(info, "/etc/passwd")
    return buf.getvalue()


async def test_file_crud_and_duplicates(client, auth, project):
    pid = project["id"]
    r = await client.post(f"/projects/{pid}/files", json={"path": "src/a.py", "content": "x = 1\n"}, headers=auth)
    assert r.status_code == 201 and r.json()["language"] == "python"
    assert (await client.post(f"/projects/{pid}/files", json={"path": "src/a.py", "content": ""}, headers=auth)).status_code == 409
    fid = r.json()["id"]
    r = await client.put(f"/projects/{pid}/files/{fid}", json={"path": "src/b.py", "content": "x = 2\n"}, headers=auth)
    assert r.json()["path"] == "src/b.py"
    assert (await client.delete(f"/projects/{pid}/files/{fid}", headers=auth)).status_code == 204
    assert (await client.get(f"/projects/{pid}/files", headers=auth)).json() == []


async def test_path_validation(client, auth, project):
    for bad in ["../x.py", "/etc/passwd", "a/../../b.py", "a\\b.py", "C:/x.py", "", "a//b.py", "."]:
        r = await client.post(f"/projects/{project['id']}/files", json={"path": bad, "content": ""}, headers=auth)
        assert r.status_code == 400, bad


async def test_file_size_limit(client, auth, project, monkeypatch):
    big = "a" * (512 * 1024 + 1)
    r = await client.post(f"/projects/{project['id']}/files", json={"path": "big.txt", "content": big}, headers=auth)
    assert r.status_code == 413


async def test_zip_upload_ok_and_skips(client, auth, project):
    z = make_zip({"app/main.py": "print(1)\n", "node_modules/x/index.js": "1", "logo.png": b"\x89PNG", "notes.txt": b"\xff\xfe\xfa bad"})
    r = await client.post(f"/projects/{project['id']}/upload", headers=auth, files={"files": ("p.zip", z, "application/zip")})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["created"] == ["app/main.py"]
    reasons = {s["path"] for s in body["skipped"]}
    assert {"node_modules/x/index.js", "logo.png", "notes.txt"} <= reasons


async def test_zip_path_traversal_rejected(client, auth, project):
    for evil in ["../evil.py", "/abs/evil.py", "a/../../evil.py"]:
        z = make_zip({evil: "x"})
        r = await client.post(f"/projects/{project['id']}/upload", headers=auth, files={"files": ("p.zip", z, "application/zip")})
        assert r.status_code == 400 and r.json()["error"]["code"] == "unsafe_archive", evil
    files = (await client.get(f"/projects/{project['id']}/files", headers=auth)).json()
    assert files == []


async def test_zip_symlink_and_bad_zip_and_bomb(client, auth, project):
    z = make_zip({"ok.py": "1"}, symlink="link.py")
    r = await client.post(f"/projects/{project['id']}/upload", headers=auth, files={"files": ("p.zip", z, "application/zip")})
    assert r.status_code == 400
    r = await client.post(f"/projects/{project['id']}/upload", headers=auth, files={"files": ("p.zip", b"not a zip", "application/zip")})
    assert r.status_code == 400
    bomb = make_zip({f"f{i}.txt": "0" * 400_000 for i in range(1)})
    assert (await client.post(f"/projects/{project['id']}/upload", headers=auth, files={"files": ("p.zip", bomb, "application/zip")})).status_code == 201


async def test_single_file_upload_invalid_encoding_and_update(client, auth, project):
    pid = project["id"]
    r = await client.post(f"/projects/{pid}/upload", headers=auth, files=[("files", ("a.py", b"x=1\n", "text/plain")),
                                                                          ("files", ("b.bin", b"\x00\x01\x02", "text/plain"))])
    assert r.json()["created"] == ["a.py"] and r.json()["skipped"][0]["path"] == "b.bin"
    r = await client.post(f"/projects/{pid}/upload", headers=auth, files={"files": ("a.py", b"x=2\n", "text/plain")})
    assert r.json()["updated"] == ["a.py"]


def test_language_detection():
    assert detect_language("a.py") == "python"
    assert detect_language("a.tsx") == "typescript"
    assert detect_language("Main.java") == "java"
    assert detect_language("q.sql") == "sql"
    assert detect_language("x.cc") == "cpp"
    assert detect_language("noext", "def f():\n    pass\n") == "python"
    assert detect_language("noext", "package main\nfunc main() {}") == "go"
    assert detect_language("noext", "hello") == "text"


async def test_detect_endpoint(client, auth):
    r = await client.post("/analysis/detect-language", json={"path": "x.go"}, headers=auth)
    assert r.json() == {"language": "go", "supported": True}
