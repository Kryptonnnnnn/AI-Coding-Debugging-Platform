import json

import pytest

from app.ai import factory
from app.ai.base import AIProvider, Completion
from app.code_intel.graph import build_graph
from app.code_intel.retrieval import rank_files
from tests.conftest import BUGGY, make_user


async def mkfile(client, auth, pid, path, content):
    r = await client.post(f"/projects/{pid}/files", json={"path": path, "content": content}, headers=auth)
    assert r.status_code == 201, r.text
    return r.json()


# ---------- graph (pure) ----------
def test_python_import_graph_resolves_internal_external_relative_and_cycles():
    files = [
        ("app/main.py", "python", "import os\nfrom app import utils\nfrom .models import User\nimport requests.adapters\n"),
        ("app/utils.py", "python", "from app.main import run\n"),            # cycle main <-> utils
        ("app/models.py", "python", "from . import utils\nimport missing_pkg\n"),
        ("app/__init__.py", "python", ""),
        ("src/pkg/mod.py", "python", "from pkg import helper\n"),             # src layout resolves via suffix
        ("src/pkg/helper.py", "python", "def h(): pass\n"),
        ("broken.py", "python", "def f(:\n"),
    ]
    g = build_graph(files)
    n = {x["path"]: x for x in g["nodes"]}
    assert set(n["app/main.py"]["imports"]) == {"app/utils.py", "app/models.py", "app/__init__.py"} or {"app/utils.py", "app/models.py"} <= set(n["app/main.py"]["imports"])
    assert {"os", "requests"} <= set(n["app/main.py"]["external"])
    assert "missing_pkg" in n["app/models.py"]["external"]
    assert n["app/utils.py"]["imported_by"] and "app/main.py" in n["app/utils.py"]["imports"]
    assert "src/pkg/helper.py" in n["src/pkg/mod.py"]["imports"]
    # `from app.util import name` must not make `app` (a project package) look like a third-party dependency
    g2 = {x["path"]: x for x in build_graph([("app/a.py", "python", "from app.util import round2\n"), ("app/util.py", "python", "def round2(): ...\n"), ("app/__init__.py", "python", "")])["nodes"]}
    assert g2["app/a.py"]["imports"] == ["app/util.py"] and g2["app/a.py"]["external"] == []
    assert any(set(c) >= {"app/main.py", "app/utils.py"} for c in g["cycles"])
    assert "syntax error" in n["broken.py"]["unresolved"][0]
    assert "not a semantic call graph" in g["disclaimer"]


def test_js_ts_import_graph_and_unsupported_languages():
    files = [
        ("src/index.ts", "typescript", "import { a } from './a';\nimport React from 'react';\nexport * from './lib';\nconst x = require('lodash/fp');\nimport('./lazy');\n"),
        ("src/a.ts", "typescript", "import '@scope/pkg/sub';\n"),
        ("src/lib/index.ts", "typescript", "export const l = 1;\n"),
        ("src/lazy.js", "javascript", ""),
        ("Main.java", "java", "import java.util.List;"),
    ]
    g = build_graph(files)
    n = {x["path"]: x for x in g["nodes"]}
    assert set(n["src/index.ts"]["imports"]) == {"src/a.ts", "src/lib/index.ts", "src/lazy.js"}
    assert set(n["src/index.ts"]["external"]) == {"react", "lodash"}
    assert n["src/a.ts"]["external"] == ["@scope/pkg"]
    assert n["src/a.ts"]["imported_by"] == ["src/index.ts"]
    assert n["Main.java"]["supported"] is False and "java" in g["unsupported"]


def test_retrieval_ranks_by_path_definitions_and_terms():
    files = [("billing/invoice.py", "class Invoice:\n    def total_price(self): ...\n"), ("auth/login.py", "def login_user(): ...\n"), ("README.md", "hello")]
    r = rank_files("How is the invoice total price calculated?", files)
    assert r[0]["path"] == "billing/invoice.py" and {"invoice", "total", "price"} <= set(r[0]["matched_terms"])
    assert all(x["path"] != "README.md" for x in r)
    assert rank_files("the and for", files) == []


# ---------- graph / retrieve / overview endpoints ----------
async def test_graph_related_retrieve_overview_endpoints_and_isolation(client, auth, project):
    pid = project["id"]
    await mkfile(client, auth, pid, "app/main.py", "from app import util\n\ndef run():\n    return util.helper()\n")
    util = await mkfile(client, auth, pid, "app/util.py", "def helper():\n    return 1\n")
    await mkfile(client, auth, pid, ".env", "SECRET=1")
    g = (await client.get(f"/projects/{pid}/graph", headers=auth)).json()
    assert g["edges"] == 1 and all(n["path"] != ".env" for n in g["nodes"])
    rel = (await client.get(f"/projects/{pid}/files/{util['id']}/related", headers=auth)).json()
    assert rel["imported_by"] == ["app/main.py"] and rel["supported"] and rel["suggested_context"][0]["relation"] == "imports this file"
    rr = (await client.post(f"/projects/{pid}/retrieve", headers=auth, json={"question": "where is helper defined?"})).json()
    assert rr["results"][0]["path"] == "app/util.py" and "not semantic" in rr["method"]
    ov = (await client.get(f"/projects/{pid}/overview", headers=auth)).json()
    assert ov["files"] == 3 and ov["languages"][0]["language"] == "python" and ov["imports"]["edges"] == 1
    assert ov["activity_counts"]["reviews"] == 0 and ov["latest_review"] is None
    other = await make_user(client, "iso@example.com")
    for m, u, kw in [("get", f"/projects/{pid}/graph", {}), ("get", f"/projects/{pid}/overview", {}), ("get", f"/projects/{pid}/files/{util['id']}/related", {}),
                     ("post", f"/projects/{pid}/retrieve", {"json": {"question": "helper function"}})]:
        assert (await getattr(client, m)(u, headers=other, **kw)).status_code == 404


async def test_debug_include_related_sends_importers_and_imports(client, auth, project):
    seen = {}

    class Spy(AIProvider):
        name, model = "mock", "spy"
        async def complete(self, messages, **kw):
            seen["user"] = messages[-1].content
            return Completion('{"summary": "ok"}', 1, 1, "estimate")
        async def stream(self, messages, **kw):
            yield "x"

    pid = project["id"]
    main = await mkfile(client, auth, pid, "app/main.py", "from app import util\n")
    await mkfile(client, auth, pid, "app/util.py", "def helper(): return 1\n")
    await mkfile(client, auth, pid, "app/unrelated.py", "x = 1\n")
    factory.set_provider_override(Spy())
    r = await client.post("/debug", headers=auth, json={"project_id": pid, "file_id": main["id"], "include_related": True})
    assert r.status_code == 201
    assert '<file path="app/util.py">' in seen["user"] and "unrelated" not in seen["user"]
    assert [x["path"] for x in r.json()["meta"]["related_files"]] == ["app/util.py"]
    r = await client.post("/debug", headers=auth, json={"project_id": pid, "file_id": main["id"]})
    assert "app/util.py" not in seen["user"] and r.json()["meta"]["related_files"] == []


# ---------- review: dedupe, baseline, compare, export ----------
async def test_review_baseline_compare_and_export(client, auth, project):
    pid = project["id"]
    f = await mkfile(client, auth, pid, "m.py", "import os\n\ndef f(x):\n    if x == None:\n        return 1\n\n# TODO later\n")
    r1 = (await client.post("/reviews", headers=auth, json={"project_id": pid})).json()
    b = await client.post(f"/reviews/{r1['id']}/baseline", headers=auth, json={"is_baseline": True, "label": "before refactor"})
    assert b.json()["is_baseline"] and b.json()["label"] == "before refactor"
    # fix one finding (None comparison) and shift lines: fingerprints are line-agnostic
    await client.put(f"/projects/{pid}/files/{f['id']}", headers=auth,
                     json={"content": "# header\n# header 2\nimport os\n\ndef f(x):\n    if x is None:\n        return 1\n\n# TODO later\n"})
    r2 = (await client.post("/reviews", headers=auth, json={"project_id": pid})).json()
    cmp = (await client.get(f"/reviews/{r1['id']}/compare/{r2['id']}", headers=auth)).json()
    resolved_rules = {x["rule_id"] for x in cmp["resolved"]}
    assert "E711" in resolved_rules and cmp["new"] == []
    assert {x["rule_id"] for x in cmp["unchanged"]} >= {"F401"}  # unused import moved lines but is the same finding
    assert any(x["title"].startswith("TODO") for x in cmp["unchanged"])
    assert cmp["baseline"]["label"] == "before refactor" and cmp["notes"]
    swapped = (await client.get(f"/reviews/{r2['id']}/compare/{r1['id']}", headers=auth)).json()
    assert {x["rule_id"] for x in swapped["new"]} == {"E711"}
    md = (await client.get(f"/reviews/{r1['id']}/export.md", headers=auth))
    assert md.status_code == 200 and md.text.startswith("# Code review") and "AI hypothesis" in md.text and "tool-confirmed" in md.text and "Baseline: before refactor" in md.text
    other = await make_user(client, "cmp@example.com")
    for u in (f"/reviews/{r1['id']}/compare/{r2['id']}", f"/reviews/{r1['id']}/export.md"):
        assert (await client.get(u, headers=other)).status_code == 404
    assert (await client.post(f"/reviews/{r1['id']}/baseline", headers=other, json={})).status_code == 404
    # cross-project comparison is rejected
    p2 = (await client.post("/projects", json={"name": "two"}, headers=auth)).json()
    await mkfile(client, auth, p2["id"], "z.py", "x = 1\n")
    r3 = (await client.post("/reviews", headers=auth, json={"project_id": p2["id"]})).json()
    assert (await client.get(f"/reviews/{r1['id']}/compare/{r3['id']}", headers=auth)).status_code == 400


async def test_ai_to_ai_duplicates_are_merged(client, auth, project):
    class Dup(AIProvider):
        name, model = "mock", "dup"
        async def complete(self, messages, **kw):
            f = {"severity": "medium", "category": "correctness", "file_path": "a.py", "title": "Division by zero when list is empty",
                 "description": "average() divides by len(xs) which can be zero", "evidence_quote": "return sum(xs) / len(xs)", "remediation": "guard"}
            return Completion(json.dumps({"summary": "s", "findings": [f, {**f, "title": "Division by zero when the list is empty"}]}), 1, 1, "estimate")
        async def stream(self, messages, **kw):
            yield "x"
    pid = project["id"]
    await mkfile(client, auth, pid, "a.py", BUGGY)
    factory.set_provider_override(Dup())
    rev = (await client.post("/reviews", headers=auth, json={"project_id": pid})).json()
    ai = [f for f in rev["findings"] if f["source"] == "ai"]
    assert len(ai) == 1 and ai[0]["merged_count"] == 1 and ai[0]["line_start"] == 2


# ---------- patch verification & regression tests ----------
async def make_patch(client, auth, project, content="def average(xs):\n    return sum(xs) / len(xs) if xs else 0\n", file=None):
    f = file or await mkfile(client, auth, project["id"], "calc.py", BUGGY)
    p = (await client.post("/patches", headers=auth, json={"file_id": f["id"], "proposed_content": content, "title": "guard"})).json()
    return f, p


async def test_verify_patch_static_checks_never_write_and_never_fake_execution(client, auth, project):
    f, p = await make_patch(client, auth, project, content="import os\ndef average(xs):\n    return sum(xs) / len(xs) if xs else 0\n")
    v = (await client.post(f"/patches/{p['id']}/verify", headers=auth, json={})).json()
    assert v["syntax"]["proposed_ok"] is True and v["syntax"]["checked_by"] == "parser"
    assert [x["rule_id"] for x in v["static"]["new_findings"]] == ["F401"]  # unused import introduced by the patch
    assert v["execution"]["status"] == "not_executed" and any("not executed" in n for n in v["notes"])
    assert (await client.get(f"/projects/{project['id']}/files/{f['id']}", headers=auth)).json()["content"] == BUGGY  # nothing written
    assert (await client.get(f"/patches/{p['id']}/verification", headers=auth)).json()["events"][-1]["event"] == "verified"


async def test_verify_flags_syntax_errors_and_sandbox_unavailable_for_tests(client, auth, project):
    f, p = await make_patch(client, auth, project, content="def average(xs:\n    return 0\n")
    v = (await client.post(f"/patches/{p['id']}/verify", headers=auth, json={"test_paths": ["test_calc.py"]})).json()
    assert v["syntax"]["proposed_ok"] is False and v["syntax"]["proposed_error"]["line"] == 1
    assert any("Do not apply it" in n for n in v["notes"])
    assert v["execution"]["status"] == "not_executed"
    _, p2 = await make_patch(client, auth, project, content=BUGGY + "# c\n", file=f)
    v2 = (await client.post(f"/patches/{p2['id']}/verify", headers=auth, json={"test_paths": ["test_calc.py"]})).json()
    assert "Sandbox unavailable" in v2["execution"]["reason"]  # sandbox disabled in tests -> honest "not executed"


async def test_verify_runs_tests_in_sandbox_on_overlay_without_writing(client, auth, project):
    from app.sandbox.base import ExecOutput, SandboxProvider, SandboxStatus
    from app.sandbox.docker_sandbox import set_sandbox_override
    calls = []

    class Fake(SandboxProvider):
        name = "fake"
        async def status(self): return SandboxStatus(True, "fake")
        async def execute(self, req):
            calls.append(req)
            return ExecOutput(1 if "xs else 0" not in req.files["calc.py"] else 0, "1 passed", "", False, False, 7)

    set_sandbox_override(Fake())
    f, p = await make_patch(client, auth, project)
    await mkfile(client, auth, project["id"], "test_calc.py", "from calc import average\ndef test_empty():\n    assert average([]) == 0\n")
    v = (await client.post(f"/patches/{p['id']}/verify", headers=auth, json={"test_paths": ["test_calc.py", "missing_test.py"]})).json()
    assert v["execution"]["status"] == "executed" and v["execution"]["results"][0]["status"] == "passed"
    assert v["execution"]["results"][1]["status"] == "error"
    assert calls[0].kind == "test" and "xs else 0" in calls[0].files["calc.py"]   # patched overlay was tested
    assert (await client.get(f"/projects/{project['id']}/files/{f['id']}", headers=auth)).json()["content"] == BUGGY


async def test_apply_records_post_apply_check_and_audit_events(client, auth, project):
    f, p = await make_patch(client, auth, project)
    await client.post(f"/patches/{p['id']}/verify", headers=auth, json={})
    assert (await client.post(f"/patches/{p['id']}/apply", headers=auth)).status_code == 200
    v = (await client.get(f"/patches/{p['id']}/verification", headers=auth)).json()
    assert [e["event"] for e in v["events"]] == ["verified", "applied"]
    assert v["post_apply"]["syntax_ok"] is True and "ruff" in v["post_apply"]["analyzers_ran"]
    f2, p2 = await make_patch(client, auth, project, content="x = 1\n", file=await mkfile(client, auth, project["id"], "other.py", "y = 2\n"))
    await client.post(f"/patches/{p2['id']}/reject", headers=auth)
    assert (await client.get(f"/patches/{p2['id']}/verification", headers=auth)).json()["events"][-1]["event"] == "rejected"
    other = await make_user(client, "ver@example.com")
    assert (await client.post(f"/patches/{p['id']}/verify", headers=other, json={})).status_code == 404
    assert (await client.get(f"/patches/{p['id']}/verification", headers=other)).status_code == 404
    assert (await client.post(f"/patches/{p['id']}/regression-tests", headers=other)).status_code == 404


async def test_regression_tests_from_patch_use_diff_and_are_labelled_unexecuted(client, auth, project):
    seen = {}

    class Spy(AIProvider):
        name, model = "mock", "spy"
        async def complete(self, messages, **kw):
            seen["user"] = messages[-1].content
            return Completion(json.dumps({"framework": "pytest", "test_path": "test_calc.py", "code": "def test_empty():\n    assert True\n", "description": "d"}), 1, 1, "estimate")
        async def stream(self, messages, **kw):
            yield "x"

    f, p = await make_patch(client, auth, project)
    factory.set_provider_override(Spy())
    r = await client.post(f"/patches/{p['id']}/regression-tests", headers=auth)
    assert r.status_code == 201, r.text
    t = r.json()
    assert "REGRESSION tests" in seen["user"] and "<diff>" in seen["user"] and "if xs else 0" in seen["user"]
    assert t["patch_id"] == p["id"] and t["executed"] is False and t["status_label"] == "Generated, not executed"
    assert "have not been run" in t["details"]["note"]
    ev = (await client.get(f"/patches/{p['id']}/verification", headers=auth)).json()["events"]
    assert ev[-1]["event"] == "regression_tests_suggested"


# ---------- account deletion ----------
async def test_account_deletion_requires_password_and_removes_everything(client, auth, project, buggy_file):
    from sqlalchemy import func, select
    from app.core.db import get_sessionmaker
    from app.models.models import CodePatch, DebuggingReport, FileVersion, Project, ProjectFile, UsageEvent, User, UserSettings
    await client.post("/debug", headers=auth, json={"project_id": project["id"], "file_id": buggy_file["id"]})
    await client.post("/conversations", headers=auth, json={"project_id": project["id"]})
    other = await make_user(client, "keep@example.com")
    op = (await client.post("/projects", json={"name": "keep"}, headers=other)).json()
    assert (await client.request("DELETE", "/auth/me", headers=auth, json={"password": "wrong-password"})).status_code == 401
    assert (await client.get("/auth/me", headers=auth)).status_code == 200
    assert (await client.request("DELETE", "/auth/me", headers=auth, json={"password": "correct-horse-1"})).status_code == 204
    assert (await client.get("/auth/me", headers=auth)).status_code == 401
    assert (await client.post("/auth/login", json={"email": "a@example.com", "password": "correct-horse-1"})).status_code == 401
    async with get_sessionmaker()() as db:
        for m in (ProjectFile, FileVersion, CodePatch, DebuggingReport, UsageEvent):
            assert await db.scalar(select(func.count()).select_from(m)) == 0, m.__name__   # everything the user owned is gone
        assert await db.scalar(select(func.count()).select_from(UserSettings)) == 1             # only the other user's settings remain
        assert await db.scalar(select(func.count()).select_from(User)) == 1
        assert await db.scalar(select(func.count()).select_from(Project)) == 1  # the other user's project survives
    assert (await client.get(f"/projects/{op['id']}", headers=other)).status_code == 200


# ---------- cleanup script ----------
async def test_cleanup_script_is_dry_run_by_default_and_requires_matching_expect(client, capsys):
    from scripts.cleanup_test_accounts import run, validate_patterns
    for e in ("live-check-1@example.com", "api-check-2@example.com", "real.person@gmail.com", "someone@example.com"):
        await make_user(client, e)
    assert await run([]) == 0
    out = capsys.readouterr().out
    assert "live-check-1@example.com" in out and "api-check-2@example.com" in out and "real.person" not in out and "someone@example.com" not in out
    assert "password" not in out.lower() and "Dry run only" in out
    assert await run(["--delete"]) == 2                        # --expect missing
    assert await run(["--delete", "--expect", "5"]) == 2       # wrong count
    from sqlalchemy import func, select
    from app.core.db import get_sessionmaker
    from app.models.models import User
    async with get_sessionmaker()() as db:
        assert await db.scalar(select(func.count()).select_from(User)) == 4
    assert await run(["--delete", "--expect", "2"]) == 0
    async with get_sessionmaker()() as db:
        left = {u.email for u in (await db.scalars(select(User))).all()}
    assert left == {"real.person@gmail.com", "someone@example.com"}
    for bad in ("%", "%@gmail.com", "%@example.com", "x@example.org"):
        with pytest.raises(SystemExit):
            validate_patterns([bad])
