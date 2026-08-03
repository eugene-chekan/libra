"""Alembic environment, wired to the application's own settings.

The database URL comes from `Settings` rather than `alembic.ini`, so there is
one source of truth for where the database lives — the same
`LIBRA_DATABASE_URL` the app itself reads. `alembic.ini` deliberately leaves
`sqlalchemy.url` empty: a value there would win in some invocations and not
others, which is exactly the kind of disagreement migrations must not have.
"""

from logging.config import fileConfig

from sqlalchemy import create_engine, pool
from sqlmodel import SQLModel

from alembic import context

# Importing the models is what populates `SQLModel.metadata`. Without it
# autogenerate sees an empty schema and cheerfully writes a migration that
# drops every table.
from app import models  # noqa: F401
from app.config import get_settings

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = SQLModel.metadata


def _database_url() -> str:
    return get_settings().database_url


def _context_kwargs() -> dict:
    return {
        "target_metadata": target_metadata,
        "compare_type": True,
        # SQLite cannot ALTER or DROP a column in place. Batch mode emulates
        # it by rebuilding the table, and every milestone after the baseline
        # alters `book` — so this is load-bearing, not precautionary.
        "render_as_batch": _database_url().startswith("sqlite"),
    }


def run_migrations_offline() -> None:
    """Emit SQL to stdout instead of running it, for review or manual apply."""
    context.configure(
        url=_database_url(),
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        **_context_kwargs(),
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations against a live connection.

    Accepts a caller-supplied connection via `config.attributes["connection"]`
    so `app.db.run_migrations()` can reuse the application's engine rather
    than opening a second one against the same SQLite file.
    """
    injected = config.attributes.get("connection")
    if injected is not None:
        context.configure(connection=injected, **_context_kwargs())
        with context.begin_transaction():
            context.run_migrations()
        return

    engine = create_engine(_database_url(), poolclass=pool.NullPool)
    with engine.connect() as connection:
        context.configure(connection=connection, **_context_kwargs())
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
