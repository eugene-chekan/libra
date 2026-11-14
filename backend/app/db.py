import sqlite3
from collections.abc import Generator
from functools import lru_cache
from pathlib import Path

from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from sqlalchemy import Connection, Engine, event
from sqlmodel import Session, create_engine

from alembic import command
from app.config import get_settings
from app.logging_config import get_logger

# Resolved from this file rather than the working directory, so migrations run
# the same whether invoked by uvicorn, pytest, or a container entrypoint.
#
# Two locations, in order. A wheel carries the revision scripts *inside* the
# package, so an installed copy is self-contained, and so is the Docker image,
# which installs the wheel. A source checkout keeps them one level up.
# Checking the packaged path first means an installed wheel never reaches past
# itself into whatever happens to sit next to site-packages.
_PACKAGED_ALEMBIC_INI = Path(__file__).resolve().parent / "alembic.ini"
_SOURCE_ALEMBIC_INI = Path(__file__).resolve().parent.parent / "alembic.ini"
ALEMBIC_INI = _PACKAGED_ALEMBIC_INI if _PACKAGED_ALEMBIC_INI.is_file() else _SOURCE_ALEMBIC_INI

log = get_logger(__name__)


# SQLite's own `lower()` folds the 26 ASCII letters and leaves every other
# alphabet where it found it. `ilike` compiles to `lower(a) LIKE lower(b)`, so
# a search found "dune" in "Dune" but not "долгая" in "Долгая". Replacing the
# function fixes every query written with `ilike`, rather than only the one
# that noticed — a later `ilike` elsewhere would have brought the bug back.
#
# Registered on the engine class rather than inside `get_engine`, because the
# tests build engines of their own and a search has to behave the same in both.
def _fold_case(value: str | None) -> str | None:
    """Lowercase a value for matching, in any alphabet."""
    return value.casefold() if value is not None else None


@event.listens_for(Engine, "connect")
def _prepare_sqlite_connection(dbapi_connection: object, _record: object) -> None:
    """Give every SQLite connection the case folding above, and enforced foreign keys.

    SQLite checks foreign keys only on a connection that asks for it, and the
    setting is not stored in the database file.
    """
    if isinstance(dbapi_connection, sqlite3.Connection):
        dbapi_connection.create_function("lower", 1, _fold_case, deterministic=True)
        dbapi_connection.execute("PRAGMA foreign_keys = ON")


@lru_cache
def get_engine() -> Engine:
    """Build the engine on first use rather than at import time."""
    settings = get_settings()
    connect_args = {"check_same_thread": False} if "sqlite" in settings.database_url else {}
    return create_engine(settings.database_url, connect_args=connect_args)


def _enforce_foreign_keys(connection: Connection, *, enforce: bool) -> None:
    """Switch SQLite's foreign key check on or off for one connection.

    Args:
        connection: A connection with no transaction open.
        enforce: True to check foreign keys, False to stop checking.
    """
    if connection.dialect.name == "sqlite":
        connection.exec_driver_sql(f"PRAGMA foreign_keys = {'ON' if enforce else 'OFF'}")
        connection.commit()


def run_migrations() -> None:
    """Bring the database up to the latest revision."""
    if not ALEMBIC_INI.is_file():
        # Only reachable if a deployment separates the package from the
        # migration scripts. Alembic's own error for this names neither the
        # path it wanted nor the reason, so say both.
        raise RuntimeError(
            f"Alembic config not found at {ALEMBIC_INI}. alembic.ini and "
            "alembic/ must be deployed alongside the app package; see "
            "[tool.hatch.build.targets.wheel.force-include] in pyproject.toml."
        )

    config = Config(ALEMBIC_INI)
    with get_engine().connect() as connection:
        # A revision that rebuilds a table drops the old one, and SQLite refuses
        # to drop a table that rows point at. SQLite ignores this setting inside
        # a transaction, so it changes before one begins and after it ends.
        _enforce_foreign_keys(connection, enforce=False)
        try:
            with connection.begin():
                before = MigrationContext.configure(connection).get_current_revision()
                config.attributes["connection"] = connection
                command.upgrade(config, "head")
                after = MigrationContext.configure(connection).get_current_revision()
        finally:
            _enforce_foreign_keys(connection, enforce=True)

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
