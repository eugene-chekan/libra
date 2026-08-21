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
from app.main import create_app, is_client_route


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
    """A mistyped endpoint must 404 rather than return a page.

    This is the assertion the SPA fallback had to be built around. Unknown
    paths under `/` now return index.html so a reload at `/books/5` works;
    endpoints live under `/api` and keep 404ing, and that separation is the
    whole reason the prefix exists. See docs/specs/client-stack.md."""
    with TestClient(create_app()) as client:
        assert client.get("/api/not-a-real-path").status_code == 404


def test_a_client_route_survives_a_reload(web_root: Path) -> None:
    """`/shelves` is an address a reader can reload, bookmark and share.

    There is no `shelves` file on disk — the path exists only inside the
    running app — so without the fallback a refresh loses the page."""
    with TestClient(create_app()) as client:
        response = client.get("/shelves")

    assert response.status_code == 200
    assert "libra" in response.text


def test_a_nested_client_route_survives_a_reload(web_root: Path) -> None:
    """The case that pushed the API under `/api`: before the prefix, `/books/5`
    was an endpoint, and reloading the book screen returned JSON."""
    with TestClient(create_app()) as client:
        response = client.get("/books/5")

    assert response.status_code == 200
    assert "libra" in response.text


def test_a_missing_asset_is_a_404_not_a_page(web_root: Path) -> None:
    """A missing `.js` is a broken build, and it has to look like one.

    Answering it with index.html makes the browser report a syntax error in a
    script rather than a 404 for a missing one, which sends whoever is
    debugging it a long way in the wrong direction."""
    with TestClient(create_app()) as client:
        assert client.get("/assets/index-abc123.js").status_code == 404
        assert client.get("/fonts/DMSans-Regular.woff2").status_code == 404


@pytest.mark.parametrize("sep", ["/", "\\"], ids=["posix", "windows"])
@pytest.mark.parametrize(
    ("path", "is_route"),
    [
        ("shelves", True),
        ("library", True),
        ("books{sep}5", True),
        ("api{sep}not-a-real-path", False),
        ("api{sep}books{sep}5", False),
        ("assets{sep}index-abc123.js", False),
        ("fonts{sep}DMSans-Regular.woff2", False),
        ("favicon.svg", False),
    ],
)
def test_which_paths_are_client_routes(path: str, is_route: bool, sep: str) -> None:
    """Both separators, because `StaticFiles` hands over an OS-native path.

    On Windows `/api/nope` arrives as `api\\nope`, so a check written against
    `api/` does not fire and a mistyped endpoint quietly returns the app. That
    version passed on Linux and failed on Windows, which is the worst shape a
    bug can have: CI calls it green. Parametrising the separator is what stops
    it coming back on whichever platform the author is not using today."""
    assert is_client_route(path.format(sep=sep)) is is_route


def test_the_api_runs_without_a_client_build(no_web: None) -> None:
    """The normal state of a checkout that has never run scripts/run.sh, and of
    a wheel built without the web assets. Not an error — the API is usable on
    its own, and Phase 5's desktop build will not want a bundled web client."""
    with TestClient(create_app()) as client:
        assert client.get("/health").status_code == 200
        assert client.get("/").status_code == 404
