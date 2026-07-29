from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="LIBRA_", env_file=".env")

    database_url: str = "sqlite:///./libra.db"
    app_name: str = "libra"


@lru_cache
def get_settings() -> Settings:
    return Settings()
