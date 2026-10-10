"""Deterministic mock provider. No network, no randomness: identical input gives identical output.

Prompts carry a `[[TASK:<name>]]` marker and `<file path="...">` blocks; the mock parses them and
applies a few simple rewrite rules so the whole product can be exercised without credentials.
"""
import json
import re
from collections.abc import AsyncIterator

from app.ai.base import AIProvider, ChatMessage, Completion, estimate_tokens

_TASK = re.compile(r"\[\[TASK:(\w+)\]\]")
_FILE = re.compile(r'<file path="([^"]*)">\n(.*?)\n</file>', re.S)

# (regex, replacement, explanation)
_RULES: list[tuple[re.Pattern[str], str, str]] = [
    (
        re.compile(r"return\s+sum\((\w+)\)\s*/\s*len\(\1\)"),
        r"return sum(\1) / len(\1) if \1 else 0",
        "Dividing by len() raises ZeroDivisionError on an empty sequence; guard the empty case.",
    ),
    (re.compile(r"(\w+)\s*==\s*None\b"), r"\1 is None", "Compare to None with `is`, not `==`."),
    (re.compile(r"(\w+)\s*!=\s*None\b"), r"\1 is not None", "Compare to None with `is not`, not `!=`."),
    (
        re.compile(r"def (\w+)\((.*?)(\w+)=\[\]"),
        r"def \1(\2\3=None",
        "A mutable default argument is shared across calls; use None and create the list inside.",
    ),
]


def _files(text: str) -> list[tuple[str, str]]:
    return _FILE.findall(text)


def _first_line_matching(code: str, pat: re.Pattern[str]) -> str:
    for line in code.splitlines():
        if pat.search(line):
            return line.strip()
    return ""


def _fix(code: str) -> tuple[str, list[str], list[tuple[str, str]]]:
    notes, quotes = [], []
    for pat, rep, why in _RULES:
        q = _first_line_matching(code, pat)
        if q:
            code = pat.sub(rep, code)
            notes.append(why)
            quotes.append((q, why))
    return code, notes, quotes


def _debug(user: str) -> dict:
    files = _files(user)
    path, code = files[0] if files else ("", "")
    fixed, notes, quotes = _fix(code)
    changed = fixed != code
    return {
        "summary": notes[0] if notes else "No deterministic defect pattern was recognised in the supplied code.",
        "root_cause": " ".join(notes) if notes else "Not determined; more context (stack trace, inputs) is needed.",
        "evidence": [{"file": path, "quote": q, "note": why} for q, why in quotes],
        "confidence": "medium" if changed else "low",
        "confidence_reasoning": "Matched a known defect pattern by static inspection; not verified by execution."
        if changed
        else "No pattern matched; this is not a diagnosis.",
        "suggested_fix": "; ".join(notes) if notes else "Provide an error message or failing input.",
        "corrected_code": fixed if changed else None,
        "fix_explanation": "The rewrite removes the identified failure mode while keeping other behavior unchanged.",
        "regressions": ["Callers that relied on the previous exception may now receive a default value."]
        if changed
        else [],
        "verification_steps": ["Run the existing test-suite.", "Add a regression test for the failing input."],
        "alternative_fixes": [
            {"title": "Raise a clear error instead", "description": "Raise ValueError with a descriptive message.",
             "corrected_code": None}
        ]
        if changed
        else [],
        "sections": [],
    }


def _review(user: str) -> dict:
    findings = []
    for path, code in _files(user):
        for i, line in enumerate(code.splitlines(), 1):
            s = line.strip()
            if re.search(r"\b(eval|exec)\(", s):
                findings.append(("high", "security", path, "Use of eval/exec", "Dynamic evaluation can run attacker-controlled code.", s, "Avoid eval/exec; use ast.literal_eval or explicit parsing."))
            if re.search(r"except\s*:\s*$", s):
                findings.append(("medium", "error-handling", path, "Bare except", "A bare except hides unrelated errors.", s, "Catch specific exception types."))
            if re.search(r"(==|!=)\s*None", s):
                findings.append(("low", "maintainability", path, "Comparison to None with ==", "Use identity comparison for None.", s, "Use `is None` / `is not None`."))
            if "TODO" in s:
                findings.append(("info", "maintainability", path, "TODO left in code", "Unfinished work is marked in the source.", s, "Resolve or track the TODO."))
    return {
        "summary": f"Mock review produced {len(findings)} finding(s) from simple textual rules.",
        "findings": [
            {"severity": a, "category": b, "file_path": c, "title": d, "description": e, "evidence_quote": f, "remediation": g}
            for a, b, c, d, e, f, g in findings
        ],
        "limitations": ["Mock provider: rule-based, not a real model. Not exhaustive."],
    }


def _tests(user: str) -> dict:
    files = _files(user)
    path, code = files[0] if files else ("module.py", "")
    lang_js = path.endswith((".js", ".ts", ".tsx", ".jsx"))
    funcs = re.findall(r"^def (\w+)\(", code, re.M) if not lang_js else re.findall(r"function (\w+)\(", code)
    mod = re.sub(r"\.\w+$", "", path.split("/")[-1])
    if lang_js:
        body = "".join(
            f"  it('{f} is defined', () => {{\n    expect(typeof {f}).toBe('function');\n  }});\n" for f in funcs
        ) or "  it.todo('add tests');\n"
        text = f"import {{ describe, it, expect }} from 'vitest';\nimport * as m from './{mod}';\nconst {{ {', '.join(funcs)} }} = m as any;\n\ndescribe('{mod}', () => {{\n{body}}});\n"
        return {"framework": "vitest", "test_path": f"{mod}.test.ts", "code": text,
                "description": "Smoke tests generated deterministically by the mock provider.",
                "behaviors": [f"{f} exists" for f in funcs], "branches_covered": [], "fixtures_mocks": [],
                "setup_instructions": "npm i -D vitest && npx vitest run"}
    body = "".join(
        f"def test_{f}_is_callable():\n    assert callable({mod}.{f})\n\n\n" for f in funcs
    ) or "def test_placeholder():\n    assert True\n"
    text = f"import {mod}\n\n\n{body}".rstrip() + "\n"
    return {"framework": "pytest", "test_path": f"test_{mod}.py", "code": text,
            "description": "Smoke tests generated deterministically by the mock provider.",
            "behaviors": [f"{f} is callable" for f in funcs], "branches_covered": [], "fixtures_mocks": [],
            "setup_instructions": "pip install pytest && pytest"}


class MockProvider(AIProvider):
    name = "mock"
    model = "mock-deterministic-1"

    def _answer(self, messages: list[ChatMessage]) -> str:
        system = next((m.content for m in messages if m.role == "system"), "")
        user = next((m.content for m in reversed(messages) if m.role == "user"), "")
        task = (_TASK.search(system) or _TASK.search(user))
        task = task.group(1) if task else "chat"
        if task == "review":
            return json.dumps(_review(user))
        if task == "tests":
            return json.dumps(_tests(user))
        if task in {"debug", "explain_error", "root_cause", "suggest_fix", "alternatives", "explain_code",
                    "edge_cases", "readability", "optimize", "refactor", "repro"}:
            out = _debug(user)
            if task in {"explain_code", "edge_cases", "repro", "explain_error"}:
                out["sections"] = [{"heading": task.replace("_", " ").title(),
                                    "body": "Mock provider output. A real model would give a detailed answer here."}]
            return json.dumps(out)
        return "Mock assistant reply: I received your message. Switch to Groq or Ollama in Settings for real answers."

    async def complete(self, messages, *, json_mode=False, max_tokens=2048) -> Completion:
        text = self._answer(messages)
        prompt = "\n".join(m.content for m in messages)
        return Completion(text, estimate_tokens(prompt), estimate_tokens(text), "estimate")

    async def stream(self, messages, *, max_tokens=2048) -> AsyncIterator[str]:
        text = self._answer(messages)
        for i in range(0, len(text), 24):
            yield text[i : i + 24]
