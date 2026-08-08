import os
from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.auth import current_user, hash_password
from app.config import Settings, get_settings
from app.db import get_engine, get_session
from app.main import create_app
from app.models import User

# Known plaintext for the seeded accounts, so tests that exercise the real
# login path have something to send.
USER_PASSWORD = "correct-horse-battery-staple"
ADMIN_PASSWORD = "admin-horse-battery-staple"


@pytest.fixture(scope="session", autouse=True)
def isolate_real_settings(tmp_path_factory: pytest.TempPathFactory) -> Generator[None, None, None]:
    """Point the process-wide settings at a temp dir for the whole session.

    Per-test fixtures below override the session and settings *dependencies*,
    but app startup still calls `init_db()` against the real engine. Without
    this, running the suite would create a stray libra.db and library/ in the
    repo. Caches are cleared so the new env is picked up and again on the way
    out so nothing leaks into another session.
    """
    root = tmp_path_factory.mktemp("libra-session")
    os.environ["LIBRA_DATABASE_URL"] = f"sqlite:///{root / 'session.db'}"
    os.environ["LIBRA_LIBRARY_DIR"] = str(root / "library")
    get_settings.cache_clear()
    get_engine.cache_clear()
    yield
    del os.environ["LIBRA_DATABASE_URL"]
    del os.environ["LIBRA_LIBRARY_DIR"]
    get_settings.cache_clear()
    get_engine.cache_clear()


@pytest.fixture(name="library_dir")
def library_dir_fixture(tmp_path: Path) -> Path:
    """A per-test library directory, so uploads never bleed between tests."""
    return tmp_path / "library"


@pytest.fixture(name="settings")
def settings_fixture(library_dir: Path) -> Settings:
    return Settings(database_url="sqlite://", library_dir=library_dir)


@pytest.fixture(name="session")
def session_fixture() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


@pytest.fixture(name="user")
def user_fixture(session: Session) -> User:
    user = User(username="reader", password_hash=hash_password(USER_PASSWORD))
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@pytest.fixture(name="other_user")
def other_user_fixture(session: Session) -> User:
    """A second ordinary user.

    Required, not decorative: per-user state is only meaningfully tested by
    proving one reader cannot see or affect another's, and a single-user
    fixture set can assert isolation that does not exist.
    """
    user = User(username="roommate", password_hash=hash_password(USER_PASSWORD))
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@pytest.fixture(name="other_client")
def other_client_fixture(
    session: Session, settings: Settings, other_user: User
) -> Generator[TestClient, None, None]:
    """Authenticated as the second ordinary user, sharing one database."""
    yield from _build_client(session, settings, other_user)


@pytest.fixture(name="admin_user")
def admin_user_fixture(session: Session) -> User:
    user = User(username="keeper", password_hash=hash_password(ADMIN_PASSWORD), is_admin=True)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _build_client(
    session: Session, settings: Settings, as_user: User | None
) -> Generator[TestClient, None, None]:
    app = create_app()

    def get_session_override() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[get_session] = get_session_override
    app.dependency_overrides[get_settings] = lambda: settings
    if as_user is not None:
        # Overriding `current_user` also covers `require_admin`, which depends
        # on it — so an admin-only route still genuinely checks `is_admin`
        # against whichever user was injected, rather than being waved past.
        app.dependency_overrides[current_user] = lambda: as_user

    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture(name="client")
def client_fixture(
    session: Session, settings: Settings, user: User
) -> Generator[TestClient, None, None]:
    """Authenticated as an ordinary user — the default for most tests."""
    yield from _build_client(session, settings, user)


@pytest.fixture(name="admin_client")
def admin_client_fixture(
    session: Session, settings: Settings, admin_user: User
) -> Generator[TestClient, None, None]:
    """Authenticated as an admin, for routes that manage shared state."""
    yield from _build_client(session, settings, admin_user)


@pytest.fixture(name="anon_client")
def anon_client_fixture(session: Session, settings: Settings) -> Generator[TestClient, None, None]:
    """No auth override, so the real cookie/session path runs.

    Used both for the unauthenticated 401 sweep and for tests that log in
    for real against the seeded accounts.
    """
    yield from _build_client(session, settings, None)
