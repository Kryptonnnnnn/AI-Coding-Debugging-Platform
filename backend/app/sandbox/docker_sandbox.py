"""Local development sandbox: one throw-away, locked-down Docker container per job.

Not a substitute for a hardened remote sandbox (gVisor/Firecracker) on a public server.
"""
import asyncio
import shutil
import tempfile
import time
import uuid
from pathlib import Path

from app.core.config import get_settings
from app.core.errors import AppError
from app.sandbox.base import ExecOutput, ExecRequest, SandboxProvider, SandboxStatus

SUPPORTED = {"python": ["python", "-I"], "javascript": ["node"]}
_cache: tuple[float, SandboxStatus] | None = None


async def _docker(*args: str, timeout: float = 10) -> tuple[int, bytes, bytes]:
    proc = await asyncio.create_subprocess_exec(
        "docker", *args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        stdin=asyncio.subprocess.DEVNULL,
    )
    try:
        out, err = await asyncio.wait_for(proc.communicate(), timeout)
    except TimeoutError:
        proc.kill()
        raise
    return proc.returncode or 0, out, err


class DisabledSandbox(SandboxProvider):
    name = "disabled"

    def __init__(self, reason: str):
        self.reason = reason

    async def status(self) -> SandboxStatus:
        return SandboxStatus(False, self.name, self.reason)

    async def execute(self, req: ExecRequest) -> ExecOutput:
        raise AppError(f"Code execution is disabled: {self.reason}", status_code=503, code="execution_disabled")


class DockerSandbox(SandboxProvider):
    name = "docker"

    async def status(self) -> SandboxStatus:
        global _cache
        if _cache and time.monotonic() - _cache[0] < 10:
            return _cache[1]
        s = get_settings()
        st: SandboxStatus
        if not s.execution_enabled:
            st = SandboxStatus(False, self.name, "EXECUTION_ENABLED is false (default).")
        elif not shutil.which("docker"):
            st = SandboxStatus(False, self.name, "Docker CLI not found.")
        else:
            try:
                rc, _, _ = await _docker("info", timeout=5)
                if rc != 0:
                    st = SandboxStatus(False, self.name, "Docker daemon is not reachable.")
                else:
                    rc, _, _ = await _docker("image", "inspect", s.sandbox_image, timeout=5)
                    st = SandboxStatus(rc == 0, self.name, "" if rc == 0 else f"Sandbox image '{s.sandbox_image}' not built. See sandbox/README.md.")
            except (TimeoutError, OSError):
                st = SandboxStatus(False, self.name, "Docker did not respond.")
        _cache = (time.monotonic(), st)
        return st

    async def execute(self, req: ExecRequest) -> ExecOutput:
        st = await self.status()
        if not st.available:  # fail closed
            raise AppError(f"Code execution is disabled: {st.reason}", status_code=503, code="execution_disabled")
        if req.language not in SUPPORTED:
            raise AppError(f"Execution is not supported for {req.language}.", code="unsupported_language")
        s = get_settings()
        name = f"aicp-{uuid.uuid4().hex[:12]}"
        with tempfile.TemporaryDirectory(prefix="aicp-exec-") as d:
            root = Path(d).resolve()
            for p, content in req.files.items():
                target = (root / p).resolve()
                if root not in target.parents:  # defence in depth; paths are already normalized
                    raise AppError("Invalid path.", code="invalid_path")
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(content, encoding="utf-8")
            root.chmod(0o755)
            if req.kind == "test":
                if req.language != "python":
                    raise AppError("Sandboxed tests are only supported for Python (pytest).", code="unsupported_language")
                cmd = ["python", "-m", "pytest", "-q", "-p", "no:cacheprovider", req.entry]
            else:
                cmd = [*SUPPORTED[req.language], req.entry]
            args = [
                "run", "--rm", "--name", name,
                "--network", "none", "--read-only",
                "--tmpfs", "/tmp:rw,noexec,nosuid,size=16m",
                "--user", "65534:65534",
                "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
                "--memory", f"{s.sandbox_memory_mb}m", "--memory-swap", f"{s.sandbox_memory_mb}m",
                "--cpus", str(s.sandbox_cpus), "--pids-limit", str(s.sandbox_pids),
                "-v", f"{root}:/work:ro", "-w", "/work",
                "-e", "PYTHONDONTWRITEBYTECODE=1",
                s.sandbox_image, *cmd,
            ]
            start = time.monotonic()
            proc = await asyncio.create_subprocess_exec(
                "docker", *args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
                stdin=asyncio.subprocess.DEVNULL,
            )
            timed_out = False
            try:
                out, err = await asyncio.wait_for(proc.communicate(), s.sandbox_timeout_seconds)
            except TimeoutError:
                timed_out = True
                await _docker("kill", name, timeout=10)
                proc.kill()
                out, err = b"", b""
            finally:
                await _docker("rm", "-f", name, timeout=10)  # cleanup even on abnormal termination
            cap = s.sandbox_max_output_bytes
            truncated = len(out) > cap or len(err) > cap
            return ExecOutput(
                exit_code=None if timed_out else proc.returncode,
                stdout=out[:cap].decode(errors="replace"),
                stderr=err[:cap].decode(errors="replace"),
                timed_out=timed_out, truncated=truncated,
                duration_ms=int((time.monotonic() - start) * 1000),
            )


_override: SandboxProvider | None = None


def set_sandbox_override(p: SandboxProvider | None) -> None:
    global _override
    _override = p


def get_sandbox() -> SandboxProvider:
    return _override or DockerSandbox()
