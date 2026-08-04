"""Login, logout, and session handling.

These use `anon_client`, which does *not* override `current_user`, so the
real cookie-and-session path runs end to end.
"""

import hashlib
from datetime import timedelta

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.auth import SESSION_COOKIE
from app.models import User, UserSession, utcnow
from tests.conftest import USER_PASSWORD


def _login(client: TestClient, username: str, password: str):
    return client.post("/auth/login", json={"username": username, "password": password})


def test_login_returns_the_user_and_sets_a_cookie(anon_client: TestClient, user: User) -> None:
    response = _login(anon_client, "reader", USER_PASSWORD)

    assert response.status_code == 200
    assert response.json()["username"] == "reader"
    assert SESSION_COOKIE in response.cookies


def test_login_is_case_insensitive_on_username(anon_client: TestClient, user: User) -> None:
    assert _login(anon_client, "ReAdEr", USER_PASSWORD).status_code == 200


def test_login_rejects_a_wrong_password(anon_client: TestClient, user: User) -> None:
    response = _login(anon_client, "reader", "not-the-password")

    assert response.status_code == 401
    assert SESSION_COOKIE not in response.cookies


def test_unknown_user_is_indistinguishable_from_a_wrong_password(
    anon_client: TestClient, user: User
) -> None:
    """Otherwise login doubles as a way to ask who has an account here."""
    wrong_password = _login(anon_client, "reader", "not-the-password")
    no_such_user = _login(anon_client, "nobody", "not-the-password")

    assert wrong_password.status_code == no_such_user.status_code == 401
    assert wrong_password.json() == no_such_user.json()


def test_me_returns_the_logged_in_user(anon_client: TestClient, user: User) -> None:
    _login(anon_client, "reader", USER_PASSWORD)

    response = anon_client.get("/auth/me")
    assert response.status_code == 200
    assert response.json()["username"] == "reader"


def test_me_requires_a_session(anon_client: TestClient) -> None:
    assert anon_client.get("/auth/me").status_code == 401


def test_a_forged_cookie_is_rejected(anon_client: TestClient, user: User) -> None:
    anon_client.cookies.set(SESSION_COOKIE, "made-up-token")

    assert anon_client.get("/auth/me").status_code == 401


def test_logout_revokes_the_session_server_side(
    anon_client: TestClient, session: Session, user: User
) -> None:
    """Clearing the cookie alone would leave a token that still works for
    anyone who captured it, so the row has to go."""
    _login(anon_client, "reader", USER_PASSWORD)
    token = anon_client.cookies[SESSION_COOKIE]

    assert anon_client.post("/auth/logout").status_code == 204
    assert session.exec(select(UserSession)).all() == []

    # Even replaying the captured cookie is dead now.
    anon_client.cookies.set(SESSION_COOKIE, token)
    assert anon_client.get("/auth/me").status_code == 401


def test_only_the_token_hash_is_stored(
    anon_client: TestClient, session: Session, user: User
) -> None:
    """A database dump must not yield usable sessions."""
    _login(anon_client, "reader", USER_PASSWORD)
    token = anon_client.cookies[SESSION_COOKIE]

    stored = session.exec(select(UserSession)).one()
    assert stored.token_hash != token
    assert stored.token_hash == hashlib.sha256(token.encode()).hexdigest()


def test_an_expired_session_is_rejected_and_cleaned_up(
    anon_client: TestClient, session: Session, user: User
) -> None:
    _login(anon_client, "reader", USER_PASSWORD)

    stored = session.exec(select(UserSession)).one()
    stored.expires_at = utcnow() - timedelta(seconds=1)
    session.add(stored)
    session.commit()

    assert anon_client.get("/auth/me").status_code == 401
    # Deleted on the way past, so the table stays bounded without a cron job.
    assert session.exec(select(UserSession)).all() == []


def test_the_session_cookie_is_httponly(anon_client: TestClient, user: User) -> None:
    """Not readable from JavaScript, so an XSS bug cannot lift the session."""
    response = _login(anon_client, "reader", USER_PASSWORD)

    set_cookie = response.headers["set-cookie"].lower()
    assert "httponly" in set_cookie
    assert "samesite=lax" in set_cookie


def test_no_response_ever_carries_the_password_hash(anon_client: TestClient, user: User) -> None:
    login = _login(anon_client, "reader", USER_PASSWORD)
    me = anon_client.get("/auth/me")

    for response in (login, me):
        assert "password_hash" not in response.text
        assert "password" not in response.json()
