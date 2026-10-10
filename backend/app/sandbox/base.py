from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class SandboxStatus:
    available: bool
    provider: str
    reason: str = ""


@dataclass
class ExecRequest:
    files: dict[str, str]  # path -> content (already validated)
    entry: str
    language: str
    kind: str = "run"  # run | test


@dataclass
class ExecOutput:
    exit_code: int | None
    stdout: str
    stderr: str
    timed_out: bool
    truncated: bool
    duration_ms: int


class SandboxProvider(ABC):
    """Execution backend. Implementations MUST fail closed: if isolation is unavailable, refuse."""

    name: str

    @abstractmethod
    async def status(self) -> SandboxStatus: ...

    @abstractmethod
    async def execute(self, req: ExecRequest) -> ExecOutput: ...
