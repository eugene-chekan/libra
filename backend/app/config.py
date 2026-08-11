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

    # The built Flutter client, served at `/` so the API and the app share one
    # origin. That is not a packaging convenience: the client resolves its API
    # address from the page it was loaded from, so one origin is what lets a
    # phone open http://<host>:8000 and just work. Served separately, the
    # client would have to be rebuilt with each server address baked in, and
    # every device's origin added to `cors_origins`.
    #
    # Defaults to the copy inside the package, which `scripts/run.sh` fills and
    # the wheel carries. Absent — a source checkout that has never built the
    # client — the API simply serves no UI.
    web_dir: Path = Path(__file__).resolve().parent / "web"

    # Upload ceiling. EPUBs are typically well under 10 MB; 100 MB leaves
    # room for image-heavy books while bounding what a single request can
    # write to disk.
    max_upload_bytes: int = 100 * 1024 * 1024

    # Cover images are read out of the EPUB on demand. Capped for the same
    # reason the XML reads are: an archive member that claims to be small and
    # expands hugely is the same threat whether it holds markup or pixels.
    max_cover_bytes: int = 10 * 1024 * 1024

    # Level for the app's own `libra.*` loggers. Does not touch uvicorn's
    # request logging, which uvicorn configures for itself.
    log_level: str = "INFO"

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

    # One SMTP account for the whole instance, shared by every user. A
    # household running one server has one mail account; per-user credentials
    # would multiply the secrets to protect and gain nobody anything. The
    # per-user half is `User.kindle_email` plus the Amazon-side approval,
    # which each person manages themselves.
    #
    # Kindle delivery is disabled unless both `smtp_host` and `smtp_from` are
    # set, so a deployment that never configures mail gets a clear 503 rather
    # than an obscure failure at send time.
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    # Environment-only. Never in a response body, never in a log line, never
    # in an error message.
    smtp_password: str | None = None
    # The address every user must add to their Amazon approved-sender list.
    # Not a secret — it is precisely the string they need to copy — so the API
    # hands it out via /auth/me.
    smtp_from: str | None = None
    smtp_starttls: bool = True
    smtp_timeout_seconds: int = 30

    # Send to Kindle caps attachments around 50 MB, below this app's own
    # 100 MB upload ceiling — so a book can be stored and never sendable.
    # Checked against the *encoded* size; see app/mailer.py.
    kindle_max_attachment_bytes: int = 50 * 1024 * 1024

    @property
    def kindle_delivery_configured(self) -> bool:
        return bool(self.smtp_host and self.smtp_from)


@lru_cache
def get_settings() -> Settings:
    return Settings()
