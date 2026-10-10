from app.ai.base import AIProvider
from app.ai.http_providers import GroqProvider, OllamaProvider
from app.ai.mock import MockProvider
from app.core.config import get_settings
from app.core.errors import AppError

PROVIDERS = ("mock", "groq", "ollama")

# Tests may install a provider here to avoid any network access.
_override: AIProvider | None = None


def set_provider_override(p: AIProvider | None) -> None:
    global _override
    _override = p


def default_model(provider: str) -> str:
    s = get_settings()
    return {"groq": s.groq_model, "ollama": s.ollama_model, "mock": "mock-deterministic-1"}[provider]


def get_provider(provider: str | None = None, model: str | None = None) -> AIProvider:
    if _override is not None:
        return _override
    s = get_settings()
    provider = provider or s.ai_provider
    if provider not in PROVIDERS:
        raise AppError(f"Unknown AI provider '{provider}'.", status_code=400, code="unknown_provider")
    model = model or (s.ai_model if provider == s.ai_provider and s.ai_model else default_model(provider))
    if provider == "groq":
        return GroqProvider(s.groq_api_key, model, s.groq_base_url, s.ai_timeout_seconds)
    if provider == "ollama":
        return OllamaProvider(s.ollama_base_url, model, s.ai_timeout_seconds)
    if s.is_production and not s.allow_mock_provider:
        raise AppError("The mock AI provider is disabled in production. Configure AI_PROVIDER=groq with GROQ_API_KEY.",
                       status_code=503, code="provider_not_configured")
    return MockProvider()


def is_external(provider: str) -> bool:
    return provider == "groq"
