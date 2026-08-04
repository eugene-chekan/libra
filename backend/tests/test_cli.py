"""The admin bootstrap command.

This is the only way an account exists before any account exists, so it runs
against a real database rather than the in-memory fixture the API tests use.
"""

from collections.abc import Generator
from pathlib import Path

import pytest
from sqlmodel import Session, select

from app.auth import verify_password
from app.cli import main
from app.config import get_settings
from app.db import get_engine
from app.models import User


@pytest.fixture(name="fresh_install")
def fresh_install_fixture(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Generator[Path, None, None]:
    """An empty database directory, as on a brand new install."""
    db_path = tmp_path / "fresh.db"
    monkeypatch.setenv("LIBRA_DATABASE_URL", f"sqlite:///{db_path}")
    monkeypatch.setenv("LIBRA_ADMIN_PASSWORD", "bootstrap-password")
    get_settings.cache_clear()
    get_engine.cache_clear()
    yield db_path
    get_engine().dispose()
    get_settings.cache_clear()
    get_engine.cache_clear()


def _users() -> list[User]:
    with Session(get_engine()) as session:
        return list(session.exec(select(User)).all())


def test_create_admin_bootstraps_an_account(fresh_install: Path) -> None:
    """Runs the migrations itself: this is plausibly the first command ever
    run against the install, so no schema exists yet."""
    assert main(["create-admin", "--username", "Keeper"]) == 0

    users = _users()
    assert len(users) == 1
    assert users[0].username == "keeper"  # normalised
    assert users[0].is_admin is True


def test_the_bootstrap_password_is_hashed_not_stored(fresh_install: Path) -> None:
    main(["create-admin", "--username", "keeper"])

    stored = _users()[0].password_hash
    assert "bootstrap-password" not in stored
    assert stored.startswith("$argon2")
    assert verify_password(stored, "bootstrap-password")


def test_create_admin_refuses_an_existing_username(fresh_install: Path) -> None:
    assert main(["create-admin", "--username", "keeper"]) == 0
    assert main(["create-admin", "--username", "KEEPER"]) == 1

    assert len(_users()) == 1


def test_create_admin_rejects_an_empty_username(fresh_install: Path) -> None:
    """Refused before the database is even created — validation comes before
    any side effect, so a bad invocation leaves nothing behind."""
    assert main(["create-admin", "--username", "   "]) == 1
    assert not fresh_install.exists()
