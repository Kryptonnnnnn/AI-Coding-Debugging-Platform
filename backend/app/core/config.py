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
    groq_model: str = "llama-3.3-70b-versatile"
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
    if s.is_production and s.secret_key.startswith("dev-only"):
        raise RuntimeError("SECRET_KEY must be set in production")
    return s
