from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "AI Coding & Debugging Platform"
    environment: str = "development"
    database_url: str = "sqlite+aiosqlite:///./dev.db"
    secret_key: str = Field(default="dev-only-change-me-dev-only-change-me")
    access_token_minutes: int = 60 * 12
    cors_origins: str = "http://localhost:3000"

    # AI providers
    ai_provider: str = "mock"  # mock | groq | ollama
    ai_model: str = ""
    groq_api_key: str = ""
    groq_base_url: str = "https://api.groq.com/openai/v1"
    groq_model: str = "openai/gpt-oss-120b"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.1"
    ai_timeout_seconds: float = 60.0
    ai_max_context_chars: int = 48_000
    ai_max_output_tokens: int = 2048

    # Limits
    max_file_bytes: int = 512 * 1024
    max_project_bytes: int = 20 * 1024 * 1024
    max_project_files: int = 2000
    max_zip_bytes: int = 10 * 1024 * 1024
    max_request_bytes: int = 12 * 1024 * 1024
    rate_limit_per_minute: int = 120
    ai_rate_limit_per_minute: int = 20
    auth_rate_limit_per_minute: int = 10

    # Sandbox (execution is OFF unless explicitly enabled AND Docker is usable)
    allow_mock_provider: bool = False  # in production the mock must be explicitly allowed (it returns canned output)
    execution_enabled: bool = False
    sandbox_image: str = "aicp-sandbox:latest"
    sandbox_timeout_seconds: int = 10
    sandbox_memory_mb: int = 128
    sandbox_cpus: float = 0.5
    sandbox_pids: int = 64
    sandbox_max_output_bytes: int = 32_768
    execution_rate_limit_per_minute: int = 5
    execution_job_retention_days: int = 7

    # Retention
    report_retention_days: int = 0  # 0 = keep forever

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    scheme = s.database_url.split("://", 1)[0] if "://" in s.database_url else ""
    if scheme.split("+")[0] not in ("postgres", "postgresql", "sqlite"):
        raise RuntimeError(
            "DATABASE_URL must start with postgresql:// (copy the connection string from Neon's Connect dialog, "
            "not a dashboard link). Found scheme: " + (scheme or "none")
        )
    if s.is_production:
        if s.secret_key.startswith("dev-only") or len(s.secret_key) < 32:
            raise RuntimeError("SECRET_KEY must be set to a random value of at least 32 characters in production")
        if s.database_url.startswith("sqlite"):
            raise RuntimeError("DATABASE_URL must point to PostgreSQL in production (local disk is ephemeral)")
        if "*" in s.cors_origin_list or not s.cors_origin_list:
            raise RuntimeError("CORS_ORIGINS must list the exact frontend origin(s) in production")
        if s.execution_enabled:
            raise RuntimeError("EXECUTION_ENABLED must be false in production unless an isolated sandbox service is configured")
    return s
