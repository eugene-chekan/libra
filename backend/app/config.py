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

    # Browser origins allowed to call the API. Empty by default: cookie auth
    # requires `allow_credentials=True`, which the CORS spec forbids pairing
    # with a `*` origin, so origins must be enumerated and there is no safe
    # permissive default to fall back on. The Phase 4 client sets this, e.g.
    # LIBRA_CORS_ORIGINS='["http://localhost:8080"]'
    cors_origins: list[str] = []

    # How long a login lasts. Long, because re-authenticating to read a book
    # in your own house is friction with nothing to show for it.
    session_ttl_days: int = 14

    # Set true when serving over HTTPS so the session cookie is not sent in
    # cleartext. Off by default because the common deployment is plain HTTP
    # on a home LAN, where a secure cookie would simply never be sent and
    # login would appear to silently fail.
    session_cookie_secure: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
