from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Instance configuration, read from the environment with a `LIBRA_` prefix.

    Every setting and its default is listed in the README; what follows is the
    reasoning the table has no room for.

    **`library_dir` and `web_dir` are both relative on purpose.** `Book.file_path`
    is stored relative to `library_dir`, so a library can be remounted — a
    Docker volume, another disk — without rewriting a single row. `web_dir`
    holds the built client and is served at `/`, which is not a packaging
    convenience: the client resolves its API address from the page it was
    loaded from, so one origin is what lets a phone open `http://<host>:8000`
    and simply work. Served separately, the client would need rebuilding for
    every address it might be reached at, and every device's origin adding to
    `cors_origins`. It defaults to the copy inside the package, which
    `scripts/run.sh` fills and the wheel carries; absent, the API serves no UI.

    **The two size ceilings guard different things.** `max_upload_bytes` bounds
    what one request can write to disk. `max_cover_bytes` bounds what an
    archive member may expand to, for the reason the XML reads are bounded: a
    member that claims to be small and is not is the same threat whether it
    holds markup or pixels.

    **`cors_origins` is empty by default and cannot safely be otherwise.**
    Cookie auth needs `allow_credentials=True`, which the CORS spec forbids
    pairing with a `*` origin, so origins have to be enumerated.

    **`session_cookie_secure` is off by default** because the common deployment
    is plain HTTP on a home LAN, where a secure cookie would never be sent and
    a login would appear to fail silently. Turn it on when serving over HTTPS.

    **`auto_upgrade_db` is on** because a household upgrades this by pulling a
    new image; the alternative is an `OperationalError` from a schema the code
    has outrun. Turn it off to run `alembic upgrade head` as its own step.

    **One SMTP account serves the whole instance.** A household running one
    server has one mail account, and per-user credentials would multiply the
    secrets to protect for no gain. The per-user half is `User.kindle_email`
    plus the Amazon-side approval, which each person manages themselves.
    `smtp_password` is environment-only: never a response body, never a log
    line, never an error message. `smtp_from` is the opposite — not a secret,
    but the exact string every reader must add to their approved-sender list,
    so `/auth/me` hands it out.

    Kindle delivery stays disabled unless both `smtp_host` and `smtp_from` are
    set, so an instance that never configures mail answers a clear 503 rather
    than failing obscurely at send time. `kindle_max_attachment_bytes` sits
    below the upload ceiling, so a book can be storable and never sendable; it
    is checked against the *encoded* size, in app/mailer.py.
    """

    model_config = SettingsConfigDict(env_prefix="LIBRA_", env_file=".env")

    database_url: str = "sqlite:///./libra.db"
    app_name: str = "libra"

    library_dir: Path = Path("./library")

    web_dir: Path = Path(__file__).resolve().parent / "web"

    max_upload_bytes: int = 100 * 1024 * 1024

    max_cover_bytes: int = 10 * 1024 * 1024

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
