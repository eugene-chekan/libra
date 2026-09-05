from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import create_app
from app.version import VERSION


def test_health_check(client: TestClient) -> None:
    # Absolute, because the client fixture is based at `/api` and health is
    # deliberately outside it — see `create_app`.
    response = client.get("http://testserver/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": VERSION}


def test_the_version_is_the_installed_one_rather_than_a_string_typed_here() -> None:
    """Whatever `pyproject.toml` says, read back from the installed package."""
    assert VERSION.count(".") == 2
    assert VERSION[0].isdigit()


# `/health` touches neither the database nor the session, so it needs none of
# the fixtures the rest of the suite builds — only settings carrying a build id.
def _client_with(settings: Settings) -> TestClient:
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: settings
    return TestClient(app)


def test_health_names_the_build_it_was_made_from(library_dir) -> None:
    client = _client_with(
        Settings(database_url="sqlite://", library_dir=library_dir, build="a1b2c3d")
    )

    body = client.get("http://testserver/health").json()

    assert body == {"status": "ok", "version": VERSION, "build": "a1b2c3d"}


def test_a_build_id_nobody_set_is_left_out_rather_than_reported_empty(library_dir) -> None:
    """An empty string in the field would read as a build called "", which is worse than silence."""
    client = _client_with(Settings(database_url="sqlite://", library_dir=library_dir, build=""))

    assert "build" not in client.get("http://testserver/health").json()
