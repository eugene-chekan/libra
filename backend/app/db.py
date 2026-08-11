from collections.abc import Generator
from functools import lru_cache
from pathlib import Path

from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from sqlalchemy import Engine
from sqlmodel import Session, create_engine

from alembic import command
from app.config import get_settings
from app.logging_config import get_logger

# Resolved from this file rather than the working directory, so migrations run
# the same whether invoked by uvicorn, pytest, or a container entrypoint.
#
# Two locations, in order. A wheel carries the revision scripts *inside* the
# package, so an installed copy is self-contained. A source checkout — and the
# Docker image, which copies them beside the package — keeps them one level up.
# Checking the packaged path first means an installed wheel never reaches past
# itself into whatever happens to sit next to site-packages.
_PACKAGED_ALEMBIC_INI = Path(__file__).resolve().parent / "alembic.ini"
_SOURCE_ALEMBIC_INI = Path(__file__).resolve().parent.parent / "alembic.ini"
ALEMBIC_INI = _PACKAGED_ALEMBIC_INI if _PACKAGED_ALEMBIC_INI.is_file() else _SOURCE_ALEMBIC_INI

log = get_logger(__name__)


@lru_cache
def get_engine() -> Engine:
    """Build the engine on first use rather than at import time.

    Deferring it means settings (and therefore the test suite's temporary
    database) are resolved when the app actually starts, instead of being
    baked in by whichever module imported this one first.
    """
    settings = get_settings()
    connect_args = {"check_same_thread": False} if "sqlite" in settings.database_url else {}
    return create_engine(settings.database_url, connect_args=connect_args)


def run_migrations() -> None:
    """Bring the database up to the latest revision.

    Alembic owns the running application's schema outright — no
    `create_all()` fallback here. Two mechanisms that can both create tables
    will eventually disagree, and the failure mode is a column that exists
    in the model but not in the database.

    Test fixtures still build their throwaway in-memory schema straight from
    `SQLModel.metadata`, because it is much faster than migrating per test.
    That is only safe because `test_migrations.py` asserts the two cannot
    drift apart.

    The application's engine is handed to Alembic rather than letting it
    open its own, so a single SQLite file is never touched by two
    connections at once during startup.
    """
    if not ALEMBIC_INI.is_file():
        # Only reachable if a deployment separates the package from the
        # migration scripts. Alembic's own error for this names neither the
        # path it wanted nor the reason, so say both.
        raise RuntimeError(
            f"Alembic config not found at {ALEMBIC_INI}. alembic.ini and "
            "alembic/ must be deployed alongside the app package; see the "
            "Dockerfile for the expected layout."
        )

    config = Config(ALEMBIC_INI)
    with get_engine().begin() as connection:
        before = MigrationContext.configure(connection).get_current_revision()
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
        after = MigrationContext.configure(connection).get_current_revision()

    # Only when something actually moved. Startup applies migrations on every
    # boot, so an unconditional line would be noise on every restart — and
    # the one case an operator wants to see is a deployment whose schema
    # changed underneath it.
    if before != after:
        log.info("Database schema upgraded: %s -> %s", before or "(empty)", after)


def init_db() -> None:
    if get_settings().auto_upgrade_db:
        run_migrations()


def get_session() -> Generator[Session, None, None]:
    with Session(get_engine()) as session:
        yield session
