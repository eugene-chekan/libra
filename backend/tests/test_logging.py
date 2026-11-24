"""Logging configuration, the JSON format, and the events logging exists to make visible.

Two kinds of site are logged: places where the code carries on after something went wrong, and
the key events of the API. The tests assert the record is emitted at all, since these paths are
otherwise silent, and assert what must *not* appear in it, which matters more.
"""

import json
import logging
import sys
from collections.abc import Callable, Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.auth import authenticate
from app.logging_config import LOGGER_NAMESPACE, JsonFormatter, configure_logging, get_logger
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


# --- the JSON format --------------------------------------------------------


def _record(**extra) -> logging.LogRecord:
    record = logging.LogRecord("libra.test", logging.INFO, __file__, 1, "book %s added", (7,), None)
    for key, value in extra.items():
        setattr(record, key, value)
    return record


def test_a_json_line_holds_the_time_level_logger_and_message() -> None:
    line = json.loads(JsonFormatter().format(_record()))

    assert line["level"] == "INFO"
    assert line["logger"] == "libra.test"
    assert line["message"] == "book 7 added"
    assert line["time"].endswith("+00:00")


def test_the_extra_fields_of_an_event_become_fields_of_the_line() -> None:
    line = json.loads(JsonFormatter().format(_record(event="book_uploaded", book_id=7)))

    assert line["event"] == "book_uploaded"
    assert line["book_id"] == 7


def test_a_traceback_is_one_field_so_the_line_stays_one_line() -> None:
    try:
        raise RuntimeError("boom")
    except RuntimeError:
        record = logging.LogRecord(
            "libra.test", logging.ERROR, __file__, 1, "failed", (), sys.exc_info()
        )

    text = JsonFormatter().format(record)

    assert "\n" not in text
    assert "RuntimeError: boom" in json.loads(text)["exception"]


def test_the_json_setting_puts_the_json_formatter_on_the_app_logger() -> None:
    try:
        configure_logging("INFO", "json")
        handlers = logging.getLogger(LOGGER_NAMESPACE).handlers
        assert any(isinstance(handler.formatter, JsonFormatter) for handler in handlers)
    finally:
        configure_logging("INFO")

    assert not any(
        isinstance(handler.formatter, JsonFormatter)
        for handler in logging.getLogger(LOGGER_NAMESPACE).handlers
    )


# --- key events -------------------------------------------------------------


@pytest.fixture(name="events")
def events_fixture(
    caplog: pytest.LogCaptureFixture,
) -> Generator[Callable[[str], list[logging.LogRecord]], None, None]:
    """The app's records of one event, by name.

    Request it after any client fixture: building a client runs `configure_logging`, which
    turns propagation off again.
    """
    logging.getLogger(LOGGER_NAMESPACE).propagate = True
    caplog.set_level(logging.DEBUG, logger=LOGGER_NAMESPACE)
    yield lambda name: [r for r in caplog.records if getattr(r, "event", None) == name]
    logging.getLogger(LOGGER_NAMESPACE).propagate = False


def test_signing_in_and_out_are_events(anon_client: TestClient, user: User, events) -> None:
    anon_client.post("/auth/login", json={"username": "reader", "password": USER_PASSWORD})
    anon_client.post("/auth/logout")

    [sign_in] = events("sign_in")
    [sign_out] = events("sign_out")
    assert sign_in.user_id == user.id
    assert sign_out.user_id == user.id


def test_a_changed_account_names_its_fields_never_their_values(
    client: TestClient, user: User, events, caplog: pytest.LogCaptureFixture
) -> None:
    client.patch(
        f"/users/{user.id}",
        json={"password": "a-brand-new-secret", "kindle_email": "me@kindle.com"},
    )

    [event] = events("user_updated")
    assert event.fields == ["kindle_email", "password"]
    assert "a-brand-new-secret" not in caplog.text
    assert "a-brand-new-secret" not in json.dumps(event.__dict__, default=str)


def test_creating_an_account_is_an_event(
    admin_client: TestClient, admin_user: User, events
) -> None:
    created = admin_client.post("/users", json={"username": "newbie", "password": "pw"}).json()

    [event] = events("user_created")
    assert event.user_id == created["id"]
    assert event.by_user_id == admin_user.id


def test_adding_and_deleting_a_book_are_events(
    admin_client: TestClient, tmp_path: Path, events
) -> None:
    from tests.epub_factory import epub_bytes

    book = admin_client.post(
        "/books/upload",
        files={"file": ("x.epub", epub_bytes(tmp_path), "application/epub+zip")},
    ).json()
    admin_client.delete(f"/books/{book['id']}")

    assert [r.book_id for r in events("book_uploaded")] == [book["id"]]
    assert [r.book_id for r in events("book_deleted")] == [book["id"]]


def test_a_question_to_the_librarian_is_logged_without_its_text(
    client: TestClient, events, caplog: pytest.LogCaptureFixture
) -> None:
    conversation = client.get("/conversations/mine").json()

    client.post(
        f"/conversations/{conversation['id']}/messages",
        json={"content": "a private question about my notes"},
    )

    [event] = events("librarian_question")
    assert event.conversation_id == conversation["id"]
    assert event.length == len("a private question about my notes")
    assert "a private question" not in caplog.text
    assert "a private question" not in JsonFormatter().format(event)


def test_pruning_sessions_is_an_event(admin_client: TestClient, events) -> None:
    admin_client.post("/maintenance/prune-sessions")

    [event] = events("sessions_pruned")
    assert event.removed == 0
