"""Serving the built client from the API.

One origin is not a packaging convenience: the client resolves its API address
from the page it was loaded from, so sharing an origin is what lets any device
on the network open the app without it being rebuilt for that address.

These build their own app rather than using the `client` fixture, because what
is under test is what `create_app` decides at startup.
"""

from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import create_app


@pytest.fixture(name="web_root")
def web_root_fixture(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Generator[Path, None, None]:
    """A stand-in for a client build's output."""
    root = tmp_path / "web"
    root.mkdir()
    (root / "index.html").write_text("<title>libra</title>", encoding="utf-8")
    (root / "app.js").write_text("// the app", encoding="utf-8")

    monkeypatch.setenv("LIBRA_WEB_DIR", str(root))
    get_settings.cache_clear()
    yield root
    get_settings.cache_clear()


@pytest.fixture(name="no_web")
def no_web_fixture(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[None, None, None]:
    monkeypatch.setenv("LIBRA_WEB_DIR", str(tmp_path / "never-built"))
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_the_root_serves_the_client(web_root: Path) -> None:
    with TestClient(create_app()) as client:
        response = client.get("/")

    assert response.status_code == 200
    assert "libra" in response.text


def test_client_assets_are_served(web_root: Path) -> None:
    with TestClient(create_app()) as client:
        assert client.get("/app.js").status_code == 200


def test_the_api_still_wins_over_the_mount(web_root: Path) -> None:
    """The mount is at `/`, so it would swallow every API path if it were
    registered before the routers. This is the assertion that catches that."""
    with TestClient(create_app()) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_a_mistyped_endpoint_is_not_quietly_the_app(web_root: Path) -> None:
    """A mistyped endpoint must 404 rather than return a page, whatever the
    mount at `/` does.

    This is the assertion that survives the SPA fallback. Once there is a
    client, `/books/5` has to return the app so a reload works, which means
    unknown paths under `/` will start returning index.html. Endpoints live
    under `/api`, so they keep 404ing — and that separation is the whole
    reason the prefix exists. See docs/specs/client-stack.md."""
    with TestClient(create_app()) as client:
        assert client.get("/api/not-a-real-path").status_code == 404


def test_the_api_runs_without_a_client_build(no_web: None) -> None:
    """The normal state of a checkout that has never run scripts/run.sh, and of
    a wheel built without the web assets. Not an error — the API is usable on
    its own, and Phase 5's desktop build will not want a bundled web client."""
    with TestClient(create_app()) as client:
        assert client.get("/health").status_code == 200
        assert client.get("/").status_code == 404
