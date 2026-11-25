"""The answer to an error that no route handled."""

import logging
from collections.abc import Generator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.logging_config import LOGGER_NAMESPACE
from app.main import SERVER_FAULT, create_app


def _crash() -> None:
    raise RuntimeError("a bug in a route")


@pytest.fixture(name="failing_app")
def failing_app_fixture() -> FastAPI:
    """The real app, plus one route with a bug in it."""
    app = create_app()
    app.add_api_route("/api/crash", _crash)
    return app


@pytest.fixture(name="app_log")
def app_log_fixture(
    failing_app: FastAPI, caplog: pytest.LogCaptureFixture
) -> Generator[pytest.LogCaptureFixture, None, None]:
    """The app's own records. `create_app` turns propagation off, so this turns it back on."""
    logging.getLogger(LOGGER_NAMESPACE).propagate = True
    caplog.set_level(logging.DEBUG, logger=LOGGER_NAMESPACE)
    yield caplog
    logging.getLogger(LOGGER_NAMESPACE).propagate = False


def test_an_unhandled_error_is_answered_with_json_not_plain_text(failing_app: FastAPI) -> None:
    # Starlette passes the error on to the server after the handler answers; the test client
    # would raise it, where uvicorn would only log it.
    client = TestClient(failing_app, raise_server_exceptions=False)

    response = client.get("/api/crash")

    assert response.status_code == 500
    assert response.headers["content-type"] == "application/json"
    assert response.json() == {"detail": SERVER_FAULT}


def test_the_answer_says_nothing_about_the_cause(failing_app: FastAPI) -> None:
    client = TestClient(failing_app, raise_server_exceptions=False)

    response = client.get("/api/crash")

    assert response.status_code == 500
    assert "a bug in a route" not in response.text
    assert "RuntimeError" not in response.text


def test_an_unhandled_error_is_logged_with_its_traceback(
    failing_app: FastAPI, app_log: pytest.LogCaptureFixture
) -> None:
    client = TestClient(failing_app, raise_server_exceptions=False)

    client.get("/api/crash")

    [record] = [r for r in app_log.records if getattr(r, "event", None) == "unhandled_error"]
    assert record.levelno == logging.ERROR
    assert record.method == "GET"
    assert record.path == "/api/crash"
    assert record.exc_info is not None
    assert "a bug in a route" in app_log.text


def test_an_error_a_route_raises_on_purpose_keeps_its_own_status(failing_app: FastAPI) -> None:
    client = TestClient(failing_app, raise_server_exceptions=False)

    response = client.get("/api/no-such-route")

    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found"}
