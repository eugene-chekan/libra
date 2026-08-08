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
    # Shared catalog fields: properties of the edition, not of a reader. All
    # three are nullable and never invented — a book whose file declares no
    # year or page count shows blank until somebody corrects it.
    year: int | None = Field(default=None)
    blurb: str | None = Field(default=None)
    pages: int | None = Field(default=None)
    book_metadata: dict = Field(default_factory=dict, sa_column=Column(SA_JSON))


class Book(BookBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    # Provenance, not ownership: it records who added the book and grants no
    # rights over it. Nullable so that removing a user does not require
    # deciding what happens to the books they contributed to a shared library.
    uploaded_by: int | None = Field(default=None, foreign_key="user.id")


class BookCreate(BookBase):
    pass


class BookRead(BookBase):
    """A book as one particular reader sees it.

    Shared catalog fields plus the caller's own state, flattened rather than
    nested: the designed client treats rating and progress as properties of
    the book on screen, and a nested object would make every call site unwrap
    it. The defaults below *are* the answer when no state row exists, which is
    the common case — rows are created lazily on first interaction.

    Built by `app.library`, never by letting `response_model` serialize a
    `Book`: these fields are not columns on `Book`, so that path silently
    drops them.
    """

    id: int
    uploaded_by: int | None = None
    rating: int = 0
    progress: float = 0.0
    started_at: datetime | None = None
    finished_at: datetime | None = None
    last_sent_at: datetime | None = None


class BookUpdate(SQLModel):
    """Partial update for a book's metadata.

    Defined standalone rather than deriving from `BookBase` so every field is
    optional and `file_path` is absent: file locations are owned by the
    storage layer, so the user edits metadata while the system keeps the
    invariant that a row points at a file it actually wrote. Supplying
    `book_metadata` replaces the dict wholesale rather than merging it.

    `year`, `blurb` and `pages` are editable because the parser frequently
    cannot supply them — `schema:numberOfPages` is rare enough that `pages` is
    in practice a user-entered column with an opportunistic parse. Not a table
    model, so the bounds below are enforced.
    """

    title: str | None = None
    author: str | None = None
    format: str | None = None
    year: int | None = None
    blurb: str | None = None
    pages: int | None = Field(default=None, ge=1)
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


class UserBookState(SQLModel, table=True):
    """One reader's relationship with one book. Created lazily on first write.

    The composite primary key is load-bearing and must not be "simplified"
    into a surrogate id with a unique index. It is what makes the lazy upsert
    a single `session.get(UserBookState, (user_id, book_id))`, and in #7 it is
    what makes "a book is on at most one of my shelves" structural rather than
    an invariant something has to enforce.

    `shelf_id` is deliberately absent until #7, which is also where the "shelf
    must be owned by user_id" check and its test live. Adding the column and
    its foreign key together there costs one batch table rebuild — exactly
    what adding the constraint alone would cost — so reserving the column now
    would buy nothing and ship a permanently-null field in the meantime.

    Note the bounds on rating and progress live on `UserBookStateWrite`, not
    here: SQLModel skips validation on `table=True` classes, so `ge`/`le`
    written here would be silently inert.
    """

    __tablename__ = "user_book_state"

    user_id: int = Field(foreign_key="user.id", primary_key=True)
    book_id: int = Field(foreign_key="book.id", primary_key=True)
    rating: int = Field(default=0)  # 0 = unrated
    progress: float = Field(default=0.0)
    started_at: datetime | None = Field(default=None)
    finished_at: datetime | None = Field(default=None)
    # Reserved here rather than in #6 on purpose: kindle-delivery.md asks for
    # it, and it is why reading state was sequenced ahead of Kindle delivery.
    last_sent_at: datetime | None = Field(default=None)
    updated_at: datetime = Field(default_factory=utcnow)


class UserBookStateWrite(SQLModel):
    """The writable half of a reader's state.

    Separate from the table model because SQLModel does not validate
    `table=True` classes — `UserBookState(rating=99)` is accepted in silence.
    The bounds only bite here, which makes this the model the endpoint takes.
    """

    rating: int = Field(default=0, ge=0, le=5)
    progress: float = Field(default=0.0, ge=0, le=1)


class Note(SQLModel, table=True):
    """A reader's note or highlight. No endpoints until Phase 2.

    The table exists now because Phase 2 builds RAG ingestion over these same
    tables, and adding it then would mean a schema change at exactly the
    moment the vector store is being wired up. Highlights are also unusually
    good retrieval material — they are the passages a reader already decided
    were worth keeping.
    """

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    book_id: int = Field(foreign_key="book.id", index=True)
    text: str
    page: int | None = Field(default=None)
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
