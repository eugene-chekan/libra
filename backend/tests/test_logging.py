"""Logging configuration and the events it exists to make visible.

Each site logged here is somewhere the code deliberately carries on after
something went wrong. The tests assert the message is emitted at all, since
the whole point is that these paths are otherwise silent — and assert what
must *not* appear in it, which matters more.
"""

import logging
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.auth import authenticate
from app.logging_config import LOGGER_NAMESPACE, configure_logging, get_logger
from app.models import User
from app.storage import delete
from tests.conftest import USER_PASSWORD


@pytest.fixture(name="captured")
def captured_fixture(caplog: pytest.LogCaptureFixture) -> pytest.LogCaptureFixture:
    """Capture the app's namespace at DEBUG regardless of configured level.

    `configure_logging` sets `propagate = False`, which is what stops our
    records reaching uvicorn's root handler and being printed twice — but it
    also stops caplog seeing them, since caplog attaches at root.
    """
    caplog.set_level(logging.DEBUG, logger=LOGGER_NAMESPACE)
    logging.getLogger(LOGGER_NAMESPACE).propagate = True
    yield caplog
    logging.getLogger(LOGGER_NAMESPACE).propagate = False


def test_get_logger_namespaces_by_module() -> None:
    assert get_logger("app.storage").name == "libra.storage"
    assert get_logger("app.routers.books").name == "libra.routers.books"


def test_configure_logging_is_idempotent() -> None:
    """`create_app()` runs once per test as well as once per process, so
    stacking a handler each time would multiply every message.

    Counts the delta rather than an absolute, because pytest attaches its own
    capture handlers to this logger.
    """
    configure_logging("INFO")
    baseline = len(logging.getLogger(LOGGER_NAMESPACE).handlers)

    configure_logging("INFO")
    configure_logging("DEBUG")

    assert len(logging.getLogger(LOGGER_NAMESPACE).handlers) == baseline


def test_configure_logging_leaves_uvicorn_alone() -> None:
    """The lesson from the alembic fileConfig bug: a logging setup that
    reaches beyond its own namespace silently kills someone else's output."""
    access = logging.getLogger("uvicorn.access")
    access.disabled = False
    access.setLevel(logging.INFO)

    configure_logging("WARNING")

    assert access.disabled is False
    assert access.level == logging.INFO


def test_configure_logging_does_not_touch_the_root_logger() -> None:
    """Adding a handler to root would duplicate every uvicorn access line,
    since uvicorn has already configured its own by this point.

    Root's handlers are cleared for the duration on purpose. pytest installs
    its own, and `logging.basicConfig` — the obvious wrong implementation —
    silently does nothing when root already has handlers. With them left in
    place this test cannot tell the right implementation from the wrong one,
    and passes either way.
    """
    root = logging.getLogger()
    saved = list(root.handlers)
    root.handlers.clear()
    try:
        configure_logging("INFO")

        assert root.handlers == []
    finally:
        root.handlers.extend(saved)


def test_a_failed_login_is_recorded_without_the_password(
    captured: pytest.LogCaptureFixture, session: Session, user: User
) -> None:
    """The one security signal a household server has. The attempted password
    must never reach the log: a wrong password here is very often the right
    password for some other account."""
    assert authenticate(session, "reader", "hunter2-the-wrong-one") is None

    assert "reader" in captured.text
    assert "hunter2-the-wrong-one" not in captured.text


def test_a_login_for_an_unknown_user_is_recorded_without_the_password(
    captured: pytest.LogCaptureFixture, session: Session
) -> None:
    assert authenticate(session, "ghost", "some-secret-password") is None

    assert "ghost" in captured.text
    assert "some-secret-password" not in captured.text


def test_a_successful_login_logs_no_credentials(
    captured: pytest.LogCaptureFixture, session: Session, user: User
) -> None:
    assert authenticate(session, "reader", USER_PASSWORD) is not None

    assert USER_PASSWORD not in captured.text


def test_deleting_a_missing_file_is_reported(
    captured: pytest.LogCaptureFixture, library_dir: Path
) -> None:
    """Callers ignore the return value on purpose, so this is the only way a
    stray or missing file is ever noticed."""
    library_dir.mkdir(parents=True, exist_ok=True)

    assert delete("not-here.epub", library_dir) is False

    assert "not-here.epub" in captured.text
    assert "not on disk" in captured.text


def test_a_path_escaping_the_library_is_reported(
    captured: pytest.LogCaptureFixture, library_dir: Path
) -> None:
    library_dir.mkdir(parents=True, exist_ok=True)

    assert delete("../outside.txt", library_dir) is False

    assert "outside the library" in captured.text


def test_an_orphaned_upload_is_reported(
    captured: pytest.LogCaptureFixture, client: TestClient, tmp_path: Path, monkeypatch
) -> None:
    """A 500's traceback says nothing about the file that was written to the
    library and then taken back out again."""
    from tests.epub_factory import epub_bytes

    def explode(*args, **kwargs):
        raise RuntimeError("database is on fire")

    monkeypatch.setattr(Session, "commit", explode)

    with pytest.raises(RuntimeError):
        client.post(
            "/books/upload",
            files={"file": ("x.epub", epub_bytes(tmp_path), "application/epub+zip")},
        )

    assert "orphaned file" in captured.text
