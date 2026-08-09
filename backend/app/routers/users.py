from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app import library
from app.auth import (
    current_user,
    get_user_by_username,
    hash_password,
    normalise_username,
    require_admin,
)
from app.db import get_session
from app.models import User, UserCreate, UserRead, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserRead])
def list_users(
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
) -> list[User]:
    return list(session.exec(select(User)).all())


@router.post("", response_model=UserRead, status_code=201)
def create_user(
    new_user: UserCreate,
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
) -> User:
    """Create an account. Admin only — there is deliberately no open
    registration endpoint; see `app/cli.py` for how the first admin exists."""
    username = normalise_username(new_user.username)
    if not username:
        raise HTTPException(status_code=422, detail="Username must not be empty")
    if not new_user.password:
        raise HTTPException(status_code=422, detail="Password must not be empty")
    if get_user_by_username(session, username) is not None:
        raise HTTPException(status_code=409, detail="Username already taken")

    user = User(
        username=username,
        password_hash=hash_password(new_user.password),
        is_admin=new_user.is_admin,
        kindle_email=new_user.kindle_email,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserRead)
def update_user(
    user_id: int,
    update: UserUpdate,
    session: Session = Depends(get_session),
    caller: User = Depends(current_user),
) -> User:
    """Update a profile.

    A user may edit their own password and Kindle address. Only an admin may
    edit somebody else's, or grant and revoke admin — including their own,
    which is why `is_admin` is checked separately from row ownership rather
    than being folded into it.
    """
    if user_id != caller.id and not caller.is_admin:
        raise HTTPException(status_code=403, detail="Cannot modify another user")

    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    fields = update.model_dump(exclude_unset=True)

    if "is_admin" in fields and not caller.is_admin:
        raise HTTPException(status_code=403, detail="Only an admin can change admin status")

    if "password" in fields:
        password = fields.pop("password")
        if not password:
            raise HTTPException(status_code=422, detail="Password must not be empty")
        user.password_hash = hash_password(password)

    for key, value in fields.items():
        setattr(user, key, value)

    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@router.delete("/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    session: Session = Depends(get_session),
    caller: User = Depends(require_admin),
) -> None:
    """Remove an account and everything private to it.

    Books they uploaded stay in the library with `uploaded_by` nulled; their
    shelves, personal tags, reading state, notes and sessions go. Public
    shelves vanish for everyone, which is the accepted visible consequence.

    Refusing self-deletion is the API's job, not the interface's. The design
    hides the control on the admin's own row, but hiding a button is a
    courtesy and this is the guard.
    """
    try:
        library.delete_user(session, user_id, caller)
    except library.UserNotFoundError as exc:
        raise HTTPException(status_code=404, detail="User not found") from exc
    except library.SelfDeletionError as exc:
        raise HTTPException(status_code=409, detail="Cannot delete your own account") from exc
