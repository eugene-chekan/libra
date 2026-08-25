from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlmodel import Session

from app.auth import (
    SESSION_COOKIE,
    authenticate,
    clear_session_cookie,
    current_user,
    issue_session,
    revoke_session,
    set_session_cookie,
)
from app.config import Settings, get_settings
from app.db import get_session
from app.models import CurrentUserRead, LoginRequest, User, UserRead

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=UserRead)
def login(
    credentials: LoginRequest,
    response: Response,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> User:
    """Exchange credentials for a session cookie."""
    user = authenticate(session, credentials.username, credentials.password)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    raw_token = issue_session(session, user, settings)
    set_session_cookie(response, raw_token, settings)
    return user


@router.post("/logout", status_code=204)
def logout(
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
    _: User = Depends(current_user),
) -> None:
    """Revoke the caller's session, server-side as well as in the browser."""
    raw_token = request.cookies.get(SESSION_COOKIE)
    if raw_token is not None:
        revoke_session(session, raw_token)
    clear_session_cookie(response)


@router.get("/me", response_model=CurrentUserRead)
def read_current_user(
    user: User = Depends(current_user),
    settings: Settings = Depends(get_settings),
) -> CurrentUserRead:
    """The caller, plus the one piece of server config they need."""
    return CurrentUserRead(
        **user.model_dump(include=set(UserRead.model_fields)),
        kindle_sender=settings.smtp_from,
    )
