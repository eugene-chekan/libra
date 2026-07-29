import os
from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.config import Settings, get_settings
from app.db import get_engine, get_session
from app.main import create_app


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


@pytest.fixture(name="client")
def client_fixture(session: Session, settings: Settings) -> Generator[TestClient, None, None]:
    app = create_app()

    def get_session_override() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[get_session] = get_session_override
    app.dependency_overrides[get_settings] = lambda: settings
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()
