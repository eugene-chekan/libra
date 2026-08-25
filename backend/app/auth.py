"""Password hashing, session issue/verification, and the auth dependencies."""

import hashlib
import secrets
from datetime import timedelta

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from fastapi import Depends, HTTPException, Request, Response
from sqlmodel import Session, select

from app.config import Settings
from app.db import get_session
from app.logging_config import get_logger
from app.models import User, UserSession, utcnow

SESSION_COOKIE = "libra_session"

log = get_logger(__name__)

# Argon2id at the library's defaults, which track the RFC 9106 guidance and
# are revised as hardware moves. Pinning our own parameters here would mean
# owning that maintenance with less information than upstream has.
_hasher = PasswordHasher()

# Verified against when the username does not exist, so a login attempt for
# an unknown user costs the same as one for a known user with a wrong
# password. Without it, response time answers "does this account exist?".
_DUMMY_HASH = _hasher.hash("not-a-real-password")


def normalise_username(raw: str) -> str:
    """Usernames are identifiers, not display names: compared case-blind."""
    return raw.strip().lower()


def hash_password(raw: str) -> str:
    return _hasher.hash(raw)


def verify_password(password_hash: str, raw: str) -> bool:
    try:
        _hasher.verify(password_hash, raw)
    except (VerifyMismatchError, InvalidHashError):
        return False
    return True


def needs_rehash(password_hash: str) -> bool:
    """True when a stored hash predates the current Argon2 parameters."""
    try:
        return _hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return False


def _token_hash(raw_token: str) -> str:
    """Hash a session token for storage."""
    return hashlib.sha256(raw_token.encode()).hexdigest()


def issue_session(session: Session, user: User, settings: Settings, kind: str = "browser") -> str:
    """Create a session row and return the raw token for the cookie.

    Args:
        session: Open database session.
        user: Who is signing in.
        settings: Supplies the session lifetime.
        kind: `browser` today; `device` is reserved for native clients.

    Returns:
        The raw token to put in the cookie. Only its hash is stored.
    """
    raw_token = secrets.token_urlsafe(32)
    session.add(
        UserSession(
            token_hash=_token_hash(raw_token),
            user_id=user.id,
            kind=kind,
            expires_at=utcnow() + timedelta(days=settings.session_ttl_days),
        )
    )
    session.commit()
    return raw_token


def revoke_session(session: Session, raw_token: str) -> None:
    stored = session.get(UserSession, _token_hash(raw_token))
    if stored is not None:
        session.delete(stored)
        session.commit()


def resolve_session(session: Session, raw_token: str) -> User | None:
    """Return the user this token authenticates, or None.

    Args:
        session: Open database session.
        raw_token: The token from the cookie.

    Returns:
        The signed-in user, or None if the token is unknown or expired.
    """
    stored = session.get(UserSession, _token_hash(raw_token))
    if stored is None:
        return None

    if stored.expires_at < utcnow():
        session.delete(stored)
        session.commit()
        return None

    return session.get(User, stored.user_id)


def get_user_by_username(session: Session, username: str) -> User | None:
    return session.exec(select(User).where(User.username == normalise_username(username))).first()


def authenticate(session: Session, username: str, password: str) -> User | None:
    """Check a username/password pair, in constant-ish time.

    Args:
        session: Open database session.
        username: As typed.
        password: As typed.

    Returns:
        The user, or None for a wrong name or a wrong password alike.
    """
    user = get_user_by_username(session, username)
    if user is None:
        verify_password(_DUMMY_HASH, password)
        # The attempted username only. Never the password: a failed login is
        # very often a password that is right for a *different* account, and
        # a log file is not the place to collect those.
        log.warning("Failed login for unknown username %r", normalise_username(username))
        return None

    if not verify_password(user.password_hash, password):
        log.warning("Failed login for %r: wrong password", user.username)
        return None

    # Transparently upgrade a hash left behind by older Argon2 parameters,
    # which is only possible here, at the one moment the plaintext exists.
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
        session.add(user)
        session.commit()

    return user


def current_user(
    request: Request,
    session: Session = Depends(get_session),
) -> User:
    """The authenticated caller, or a 401."""
    raw_token = request.cookies.get(SESSION_COOKIE)
    if raw_token is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user = resolve_session(session, raw_token)
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def require_admin(user: User = Depends(current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin privileges required")
    return user


def set_session_cookie(response: Response, raw_token: str, settings: Settings) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        raw_token,
        max_age=settings.session_ttl_days * 24 * 60 * 60,
        httponly=True,
        samesite="lax",
        secure=settings.session_cookie_secure,
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, httponly=True, samesite="lax")


__all__ = [
    "SESSION_COOKIE",
    "authenticate",
    "clear_session_cookie",
    "current_user",
    "hash_password",
    "issue_session",
    "normalise_username",
    "require_admin",
    "revoke_session",
    "set_session_cookie",
]
