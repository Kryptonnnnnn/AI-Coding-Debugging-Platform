"""Deterministic static analysis through fixed-argument tool invocations.

Source is passed via stdin or a private temp file. It is parsed/linted, never executed.
No shell is used, and the child environment is scrubbed so no app secrets leak into diagnostics.
"""
import ast
import asyncio
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

from pydantic import BaseModel

TOOL_TIMEOUT = 15
MAX_OUTPUT = 200_000


class Finding(BaseModel):
    tool: str
    rule_id: str = ""
    severity: str  # critical | high | medium | low | info
    file: str
    line: int | None = None
    column: int | None = None
    message: str
    remediation: str = ""
    deterministic: bool = True


class ToolStatus(BaseModel):
    tool: str
    status: str  # ran | unavailable | failed | skipped
    detail: str = ""


class AnalysisResult(BaseModel):
    language: str
    findings: list[Finding]
    tools: list[ToolStatus]


def _env() -> dict[str, str]:
    return {"PATH": os.environ.get("PATH", ""), "LANG": "C.UTF-8"}


async def _run(argv: list[str], stdin: bytes | None = None) -> tuple[int, bytes, bytes]:
    proc = await asyncio.create_subprocess_exec(
        *argv,
        stdin=asyncio.subprocess.PIPE if stdin is not None else asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=_env(),
    )
    try:
        out, err = await asyncio.wait_for(proc.communicate(stdin), TOOL_TIMEOUT)
    except TimeoutError:
        proc.kill()
        await proc.wait()
        raise
    return proc.returncode or 0, out[:MAX_OUTPUT], err[:MAX_OUTPUT]


def _module_available(mod: str) -> bool:
    import importlib.util

    return importlib.util.find_spec(mod) is not None


def _ruff_severity(code: str) -> str:
    if code.startswith(("E9", "F63", "F7", "F82")):
        return "high"
    if code.startswith(("F", "B")):
        return "medium"
    return "low"


async def _python(path: str, code: str, tools: list[ToolStatus], findings: list[Finding], run_extra: bool) -> None:
    try:
        ast.parse(code, filename=path)
        tools.append(ToolStatus(tool="python-ast", status="ran", detail="syntax valid"))
    except SyntaxError as e:
        tools.append(ToolStatus(tool="python-ast", status="ran", detail="syntax error"))
        findings.append(Finding(tool="python-ast", rule_id="SyntaxError", severity="high", file=path, line=e.lineno,
                                column=e.offset, message=e.msg or "Invalid syntax",
                                remediation="Fix the syntax error; the parser could not read this file."))
        return  # linting a file that does not parse is noise

    if _module_available("ruff"):
        try:
            rc, out, err = await _run([sys.executable, "-m", "ruff", "check", "--isolated", "--select", "E4,E7,E9,F,B",
                                       "--output-format=json",
                                       "--stdin-filename", path, "-"], code.encode())
            for item in json.loads(out or b"[]"):
                loc = item.get("location") or {}
                findings.append(Finding(tool="ruff", rule_id=item.get("code") or "", severity=_ruff_severity(item.get("code") or ""),
                                        file=path, line=loc.get("row"), column=loc.get("column"), message=item["message"],
                                        remediation=f"See https://docs.astral.sh/ruff/rules/{item.get('code', '')}"))
            tools.append(ToolStatus(tool="ruff", status="ran"))
        except Exception as e:
            tools.append(ToolStatus(tool="ruff", status="failed", detail=type(e).__name__))
    else:
        tools.append(ToolStatus(tool="ruff", status="unavailable", detail="pip install ruff"))

    if run_extra and _module_available("bandit"):
        try:
            rc, out, err = await _run([sys.executable, "-m", "bandit", "-f", "json", "-q", "-"], code.encode())
            data = json.loads(out or b"{}")
            for r in data.get("results", []):
                sev = {"HIGH": "high", "MEDIUM": "medium", "LOW": "low"}.get(r["issue_severity"], "low")
                findings.append(Finding(tool="bandit", rule_id=r["test_id"], severity=sev, file=path, line=r.get("line_number"),
                                        message=r["issue_text"], remediation=r.get("more_info", "")))
            tools.append(ToolStatus(tool="bandit", status="ran"))
        except Exception as e:
            tools.append(ToolStatus(tool="bandit", status="failed", detail=type(e).__name__))
    elif run_extra:
        tools.append(ToolStatus(tool="bandit", status="unavailable", detail="pip install bandit"))


async def _javascript(path: str, code: str, tools: list[ToolStatus], findings: list[Finding]) -> None:
    node = shutil.which("node")
    if not node:
        tools.append(ToolStatus(tool="node --check", status="unavailable", detail="Node.js not installed"))
        return
    ext = ".mjs" if any(k in code for k in ("import ", "export ")) else ".cjs"
    with tempfile.TemporaryDirectory(prefix="aicp-") as d:
        f = Path(d) / f"input{ext}"
        f.write_text(code, encoding="utf-8")
        try:
            rc, _, err = await _run([node, "--check", str(f)])
        except TimeoutError:
            tools.append(ToolStatus(tool="node --check", status="failed", detail="timeout"))
            return
    if rc == 0:
        tools.append(ToolStatus(tool="node --check", status="ran", detail="syntax valid"))
        return
    tools.append(ToolStatus(tool="node --check", status="ran", detail="syntax error"))
    text = err.decode(errors="replace")
    line = None
    lines = text.splitlines()
    for ln in lines:
        if ln.startswith(str(f) + ":"):
            try:
                line = int(ln.split(":")[-1])
            except ValueError:
                pass
            break
    msg = next((ln for ln in lines if "Error" in ln and not ln.startswith(str(d))), "Syntax error")
    findings.append(Finding(tool="node --check", rule_id="SyntaxError", severity="high", file=path, line=line,
                            message=msg.strip()[:300], remediation="Fix the syntax error reported by the Node.js parser."))


async def analyze(path: str, code: str, language: str, *, security: bool = True) -> AnalysisResult:
    findings: list[Finding] = []
    tools: list[ToolStatus] = []
    if language == "python":
        await _python(path, code, tools, findings, security)
    elif language == "javascript":
        await _javascript(path, code, tools, findings)
    elif language == "typescript":
        tools.append(ToolStatus(tool="tsc", status="unavailable",
                                detail="TypeScript is checked in the frontend toolchain only; no server-side checker is integrated."))
    else:
        tools.append(ToolStatus(tool="static-analysis", status="skipped",
                                detail=f"No deterministic analyzer is integrated for {language}. Only AI analysis is available."))
    return AnalysisResult(language=language, findings=findings, tools=tools)
