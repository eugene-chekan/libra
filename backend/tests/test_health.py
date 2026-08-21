from fastapi.testclient import TestClient


def test_health_check(client: TestClient) -> None:
    # Absolute, because the client fixture is based at `/api` and health is
    # deliberately outside it — see `create_app`.
    response = client.get("http://testserver/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
