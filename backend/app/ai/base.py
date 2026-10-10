from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass

from app.core.errors import ProviderError


class ProviderTimeout(ProviderError):
    status_code = 504
    code = "provider_timeout"


class ProviderRateLimited(ProviderError):
    status_code = 429
    code = "provider_rate_limited"


class ProviderTokenLimit(ProviderError):
    status_code = 413
    code = "provider_token_limit"


class MalformedOutput(ProviderError):
    status_code = 502
    code = "malformed_model_output"


@dataclass
class ChatMessage:
    role: str  # system | user | assistant
    content: str


@dataclass
class Completion:
    text: str
    prompt_tokens: int
    completion_tokens: int
    token_source: str  # "provider" when the API reported usage, otherwise "estimate"


def estimate_tokens(text: str) -> int:
    """Rough heuristic (~4 chars/token). Always labelled as an estimate."""
    return max(1, len(text) // 4)


class AIProvider(ABC):
    name: str
    model: str

    @abstractmethod
    async def complete(
        self, messages: list[ChatMessage], *, json_mode: bool = False, max_tokens: int = 2048
    ) -> Completion: ...

    @abstractmethod
    def stream(self, messages: list[ChatMessage], *, max_tokens: int = 2048) -> AsyncIterator[str]: ...

    async def health(self) -> dict:
        return {"provider": self.name, "model": self.model, "reachable": True}
