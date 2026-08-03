from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="LIBRA_", env_file=".env")

    database_url: str = "sqlite:///./libra.db"
    app_name: str = "libra"

    # Directory holding the actual ebook files. Book.file_path values are
    # stored relative to this, so the library can be remounted elsewhere
    # (e.g. a Docker volume) without invalidating existing rows.
    library_dir: Path = Path("./library")

    # Upload ceiling. EPUBs are typically well under 10 MB; 100 MB leaves
    # room for image-heavy books while bounding what a single request can
    # write to disk.
    max_upload_bytes: int = 100 * 1024 * 1024

    # Run pending migrations on startup. On by default because this is a
    # self-hosted app a household upgrades by pulling a new image: the
    # alternative is that they hit an OperationalError from a schema the
    # code has outrun. Set false to run `alembic upgrade head` as its own
    # deploy step instead.
    auto_upgrade_db: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()
