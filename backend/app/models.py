from datetime import UTC, datetime

from sqlalchemy import JSON as SA_JSON
from sqlalchemy import Column
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    """Current UTC time as a naive datetime.

    SQLite has no native timezone type, and SQLAlchemy hands back naive
    values when reading a stored aware one — which then raises TypeError the
    moment it is compared with an aware `datetime.now(UTC)`. Storing naive
    UTC everywhere and going through this one helper keeps every comparison
    between two values of the same kind.
    """
    return datetime.now(UTC).replace(tzinfo=None)


class BookBase(SQLModel):
    title: str
    author: str
    format: str
    file_path: str
    book_metadata: dict = Field(default_factory=dict, sa_column=Column(SA_JSON))


class Book(BookBase, table=True):
    id: int | None = Field(default=None, primary_key=True)


class BookCreate(BookBase):
    pass


class BookRead(BookBase):
    id: int


class BookUpdate(SQLModel):
    """Partial update for a book's metadata.

    Defined standalone rather than deriving from `BookBase` so every field is
    optional and `file_path` is absent: file locations are owned by the
    storage layer, so the user edits metadata while the system keeps the
    invariant that a row points at a file it actually wrote. Supplying
    `book_metadata` replaces the dict wholesale rather than merging it.
    """

    title: str | None = None
    author: str | None = None
    format: str | None = None
    book_metadata: dict | None = None


class User(SQLModel, table=True):
    """A person with an account on this instance.

    `username` is stored already normalised (stripped and lowercased) by
    `normalise_username`, which is what makes a plain unique index enough to
    enforce case-insensitive uniqueness. The alternative — keeping the
    original casing and adding a unique index over `lower(username)` — reads
    better but autogenerate renders expression indexes poorly, which would
    leave `alembic check` reporting drift on every run.
    """

    id: int | None = Field(default=None, primary_key=True)
    username: str = Field(unique=True, index=True)
    password_hash: str
    is_admin: bool = Field(default=False)
    kindle_email: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=utcnow)


class UserSession(SQLModel, table=True):
    """A logged-in session, keyed by the hash of its cookie token.

    Named `UserSession` rather than `Session` because `sqlmodel.Session` is
    already all over this codebase and two things called Session in the same
    module is a bug waiting to happen.

    The raw token is never stored. It is high-entropy random, so a single
    SHA-256 is enough — no password-style stretching is needed — and it means
    a leaked database dump yields no usable sessions.
    """

    __tablename__ = "user_session"

    token_hash: str = Field(primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    # "browser" today; "device" is reserved for the long-lived per-device
    # tokens Phase 5's native clients will need, so that lands as a row
    # rather than a schema change.
    kind: str = Field(default="browser")
    expires_at: datetime
    created_at: datetime = Field(default_factory=utcnow)


class UserCreate(SQLModel):
    username: str
    password: str
    is_admin: bool = False
    kindle_email: str | None = None


class UserRead(SQLModel):
    """Defined standalone, never derived from `User`, so that adding a field
    to the table cannot silently start publishing it — `password_hash` in
    particular."""

    id: int
    username: str
    is_admin: bool
    kindle_email: str | None
    created_at: datetime


class UserUpdate(SQLModel):
    password: str | None = None
    kindle_email: str | None = None
    is_admin: bool | None = None


class LoginRequest(SQLModel):
    username: str
    password: str
