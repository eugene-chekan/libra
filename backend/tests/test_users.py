"""User administration and self-service profile edits."""

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.models import User
from tests.conftest import USER_PASSWORD


def test_admin_creates_a_user(admin_client: TestClient) -> None:
    response = admin_client.post(
        "/users", json={"username": "Newcomer", "password": "a-good-password"}
    )

    assert response.status_code == 201
    body = response.json()
    assert body["username"] == "newcomer"  # normalised on the way in
    assert body["is_admin"] is False
    assert "password_hash" not in body


def test_duplicate_usernames_are_rejected_case_insensitively(
    admin_client: TestClient, user: User
) -> None:
    response = admin_client.post("/users", json={"username": "READER", "password": "x"})

    assert response.status_code == 409


def test_empty_username_or_password_is_rejected(admin_client: TestClient) -> None:
    assert admin_client.post("/users", json={"username": "  ", "password": "x"}).status_code == 422
    assert admin_client.post("/users", json={"username": "ok", "password": ""}).status_code == 422


def test_listing_users_never_exposes_hashes(admin_client: TestClient, user: User) -> None:
    response = admin_client.get("/users")

    assert response.status_code == 200
    assert "password_hash" not in response.text


def test_a_user_can_update_their_own_kindle_address(client: TestClient, user: User) -> None:
    response = client.patch(f"/users/{user.id}", json={"kindle_email": "me@kindle.com"})

    assert response.status_code == 200
    assert response.json()["kindle_email"] == "me@kindle.com"


def test_a_user_cannot_update_somebody_else(
    client: TestClient, user: User, admin_user: User
) -> None:
    response = client.patch(f"/users/{admin_user.id}", json={"kindle_email": "mine@kindle.com"})

    assert response.status_code == 403


def test_a_user_cannot_promote_themselves(client: TestClient, user: User) -> None:
    """The obvious privilege-escalation route: patching your own row is
    allowed, so `is_admin` has to be checked separately from ownership."""
    response = client.patch(f"/users/{user.id}", json={"is_admin": True})

    assert response.status_code == 403


def test_an_admin_can_promote_someone(admin_client: TestClient, user: User) -> None:
    response = admin_client.patch(f"/users/{user.id}", json={"is_admin": True})

    assert response.status_code == 200
    assert response.json()["is_admin"] is True


def test_an_admin_cannot_demote_themselves(
    admin_client: TestClient, session: Session, admin_user: User
) -> None:
    """The same rule as self-deletion, for the same reason.

    Only an admin may clear the flag, and no admin may clear their own, so
    every request leaves at least one administrator standing. An instance
    can never be locked out of its own admin page.
    """
    response = admin_client.patch(f"/users/{admin_user.id}", json={"is_admin": False})

    assert response.status_code == 409
    session.refresh(admin_user)
    assert admin_user.is_admin is True


def test_an_admin_can_demote_another_admin(
    admin_client: TestClient, session: Session, user: User
) -> None:
    """The guard is about the caller's own row, not about the flag."""
    user.is_admin = True
    session.add(user)
    session.commit()

    response = admin_client.patch(f"/users/{user.id}", json={"is_admin": False})

    assert response.status_code == 200
    assert response.json()["is_admin"] is False


def test_an_admin_may_send_their_own_flag_back_unchanged(
    admin_client: TestClient, admin_user: User
) -> None:
    """Only `false` is refused. A form that posts every field still works."""
    response = admin_client.patch(f"/users/{admin_user.id}", json={"is_admin": True})

    assert response.status_code == 200
    assert response.json()["is_admin"] is True


def test_changing_a_password_takes_effect(
    client: TestClient, anon_client: TestClient, user: User
) -> None:
    assert client.patch(f"/users/{user.id}", json={"password": "a-new-password"}).status_code == 200

    stale = anon_client.post("/auth/login", json={"username": "reader", "password": USER_PASSWORD})
    fresh = anon_client.post(
        "/auth/login", json={"username": "reader", "password": "a-new-password"}
    )

    assert stale.status_code == 401
    assert fresh.status_code == 200


def test_patching_an_unknown_user_returns_404(admin_client: TestClient) -> None:
    assert (
        admin_client.patch("/users/999", json={"kindle_email": "x@kindle.com"}).status_code == 404
    )
