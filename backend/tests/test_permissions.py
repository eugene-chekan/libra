"""Who may do what.

The defining bug class of multi-user work is a route that forgot its
dependency, so the sweep below walks the actual route table rather than a
hand-kept list — a new endpoint is covered the moment it is registered.
"""

from collections.abc import Iterator

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.main import create_app

BOOK_PAYLOAD = {
    "title": "Dune",
    "author": "Frank Herbert",
    "format": "epub",
    "file_path": "dune.epub",
    "book_metadata": {},
}

# The only routes reachable without a session, and why.
PUBLIC_ROUTES = {
    ("GET", "/health"),  # liveness probes run before anyone can log in
    ("POST", "/auth/login"),  # the way a session is obtained in the first place
}

# FastAPI's own docs endpoints, not part of the API surface.
_DOCS_PATHS = {"/openapi.json", "/docs", "/redoc", "/docs/oauth2-redirect"}


def _walk(routes) -> Iterator[tuple[str, str]]:
    """Yield (method, path) for every endpoint, descending into included routers.

    `include_router` does not flatten its routes into `app.routes`; it adds a
    wrapper exposing the original router, whose own routes carry the full
    prefixed path. Walking only the top level finds the docs endpoints and
    nothing else — which is exactly how this test could have passed while
    checking nothing.
    """
    for route in routes:
        included = getattr(route, "original_router", None)
        if included is not None:
            yield from _walk(getattr(included, "routes", []))
            continue

        path, methods = getattr(route, "path", None), getattr(route, "methods", None)
        if not path or not methods:
            continue
        for method in sorted(methods - {"HEAD", "OPTIONS"}):
            yield method, path


def _api_routes(app: FastAPI | None = None) -> list[tuple[str, str]]:
    """Every (method, path) the app serves, minus FastAPI's own docs.

    Built from `create_app()` rather than the TestClient, which does not
    expose the FastAPI instance. Routes are static, so a fresh app has the
    same table as the one under test.
    """
    return [
        (method, path)
        for method, path in _walk((app or create_app()).routes)
        if path not in _DOCS_PATHS
    ]


def test_every_route_requires_authentication(anon_client: TestClient) -> None:
    """Exhaustive over the route table: this is what catches the endpoint
    that was added without a `current_user` dependency."""
    checked = 0
    for method, path in _api_routes():
        if (method, path) in PUBLIC_ROUTES:
            continue
        concrete = path.replace("{book_id}", "1").replace("{user_id}", "1")

        response = anon_client.request(method, concrete)

        assert response.status_code == 401, f"{method} {path} returned {response.status_code}"
        checked += 1

    # Without this the test passes vacuously if the route walk ever breaks.
    assert checked >= 8, f"only swept {checked} routes — is _api_routes still working?"


def test_the_public_allowlist_is_not_stale() -> None:
    """Guards the allowlist: if a listed route is renamed or removed,
    PUBLIC_ROUTES silently starts excusing nothing — or worse, excuses a
    path that now means something else."""
    assert set(_api_routes()) >= PUBLIC_ROUTES


def test_health_is_reachable_without_a_session(anon_client: TestClient) -> None:
    assert anon_client.get("/health").status_code == 200


def test_an_ordinary_user_can_read_and_add_books(client: TestClient) -> None:
    """The catalog is shared: reading it and adding to it are not privileged."""
    assert client.get("/books").status_code == 200
    assert client.post("/books", json=BOOK_PAYLOAD).status_code == 201


def test_an_ordinary_user_cannot_edit_shared_metadata(client: TestClient) -> None:
    created = client.post("/books", json=BOOK_PAYLOAD).json()

    response = client.patch(f"/books/{created['id']}", json={"title": "Mine now"})

    assert response.status_code == 403


def test_an_ordinary_user_cannot_delete_a_book(client: TestClient) -> None:
    created = client.post("/books", json=BOOK_PAYLOAD).json()

    assert client.delete(f"/books/{created['id']}").status_code == 403
    # And the book is genuinely still there, not just reported as refused.
    assert client.get(f"/books/{created['id']}").status_code == 200


def test_an_ordinary_user_cannot_list_or_create_users(client: TestClient) -> None:
    assert client.get("/users").status_code == 403
    assert (
        client.post(
            "/users", json={"username": "smuggled", "password": "x", "is_admin": True}
        ).status_code
        == 403
    )


def test_an_admin_can_do_all_of_it(admin_client: TestClient) -> None:
    created = admin_client.post("/books", json=BOOK_PAYLOAD).json()

    assert admin_client.patch(f"/books/{created['id']}", json={"title": "Fixed"}).status_code == 200
    assert admin_client.delete(f"/books/{created['id']}").status_code == 204
    assert admin_client.get("/users").status_code == 200
