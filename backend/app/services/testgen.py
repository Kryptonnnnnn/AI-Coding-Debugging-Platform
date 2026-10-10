import ast
import json
import posixpath

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.base import AIProvider, ChatMessage
from app.ai.structured import run_structured
from app.core.errors import AppError
from app.core.redaction import redact_secrets
from app.models.models import CodeSession, GeneratedTest, ProjectFile, User
from app.schemas.ai_outputs import TestOutput
from app.services.ai_gateway import record_usage, system_message
from app.services.context import SYSTEM_RULES, build_context
from app.services.files import normalize_path

TEST_LANGS = {"python": "pytest", "javascript": "vitest", "typescript": "vitest"}


async def generate_tests(db: AsyncSession, user: User, provider: AIProvider, f: ProjectFile,
                         framework: str | None, project_has_jest: bool, patch=None) -> tuple[GeneratedTest, dict]:
    if f.language not in TEST_LANGS:
        raise AppError(f"Test generation is supported for Python, JavaScript and TypeScript, not {f.language}.",
                       code="unsupported_language")
    fw = framework or ("jest" if project_has_jest and f.language != "python" else TEST_LANGS[f.language])
    source = (f.path, patch.proposed_content) if patch is not None else f  # tests target the code as it would be after the patch
    ctx = build_context([source])
    messages = [
        system_message("tests", SYSTEM_RULES + f"\nWrite {fw} tests. Cover unit, boundary, invalid-input and regression cases; "
                       "suggest mocks/fixtures and setup. Do not claim coverage numbers.",
                       json.dumps(TestOutput.model_json_schema())),
        ChatMessage("user", f"{ctx.text}\n\n" + (
            f"Task: write REGRESSION tests for this change. They should fail on the original code and pass on the patched code shown above.\n"
            f"<diff>\n{redact_secrets(patch.diff)[:8000]}\n</diff>" if patch is not None else f"Task: generate {fw} tests for this file.")),
    ]
    out, comps = await run_structured(provider, messages, TestOutput, max_tokens=3000)

    folder = posixpath.dirname(f.path)
    try:
        name = posixpath.basename(normalize_path(out.test_path))
    except AppError:
        name = ("test_" + posixpath.basename(f.path)) if f.language == "python" else posixpath.basename(f.path).replace(".", ".test.")
    test_path = posixpath.join(folder, name) if folder else name

    syntax_ok: bool | None = None
    if f.language == "python":
        try:
            ast.parse(out.code)
            syntax_ok = True
        except SyntaxError:
            syntax_ok = False
    usage = await record_usage(db, user.id, "tests", provider, comps)
    rec = GeneratedTest(user_id=user.id, project_id=f.project_id, file_id=f.id, patch_id=patch.id if patch is not None else None, framework=fw, test_path=test_path,
                        code=out.code, description=out.description, provider=provider.name, model=provider.model,
                        details={"behaviors": out.behaviors, "branches_covered": out.branches_covered,
                                 "fixtures_mocks": out.fixtures_mocks, "setup_instructions": out.setup_instructions,
                                 "syntax_valid": syntax_ok, "executed": False, "from_patch": str(patch.id) if patch is not None else None,
                                 "note": "Regression tests are suggestions generated from the diff. They have not been run against the original or patched code." if patch is not None else "",
                                 "coverage": "not measured"})
    db.add(rec)
    await db.flush()
    db.add(CodeSession(user_id=user.id, project_id=f.project_id, kind="tests", title=(f"Regression tests for patch: {patch.title[:120]}" if patch is not None else f"Tests for {f.path}"), ref_id=rec.id))
    return rec, {"usage": usage, "context": ctx.summary()}
