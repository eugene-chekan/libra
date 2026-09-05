from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Instance configuration, read from the environment with a `LIBRA_` prefix."""

    model_config = SettingsConfigDict(env_prefix="LIBRA_", env_file=".env")

    database_url: str = "sqlite:///./libra.db"
    app_name: str = "libra"

    library_dir: Path = Path("./library")

    web_dir: Path = Path(__file__).resolve().parent / "web"

    max_upload_bytes: int = 100 * 1024 * 1024

    max_cover_bytes: int = 10 * 1024 * 1024

    # Set by the run scripts and the Dockerfile from `git rev-parse --short
    # HEAD`. Empty everywhere else, including a wheel built from a source tree
    # with no repository, which is why nothing may assume it is there.
    build: str = ""

    log_level: str = "INFO"

    auto_upgrade_db: bool = True

    cors_origins: list[str] = []

    session_ttl_days: int = 14

    session_cookie_secure: bool = False

    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from: str | None = None
    smtp_starttls: bool = True
    smtp_timeout_seconds: int = 30

    kindle_max_attachment_bytes: int = 50 * 1024 * 1024

    @property
    def kindle_delivery_configured(self) -> bool:
        return bool(self.smtp_host and self.smtp_from)


@lru_cache
def get_settings() -> Settings:
    return Settings()
