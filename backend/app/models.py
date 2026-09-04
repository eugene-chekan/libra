from datetime import UTC, datetime
from typing import Literal

from sqlalchemy import JSON as SA_JSON
from sqlalchemy import Column, Index, String, text
from sqlmodel import Field, SQLModel

SHELF_PRIVATE = "private"
SHELF_PUBLIC = "public"
# A Literal on the *write* models, so an unknown value is a 422 from FastAPI
# rather than a string that reaches the database. Bounds and enums never bite
# on `table=True` classes — see the note in library-organization.md.
ShelfVisibility = Literal["private", "public"]

# What a cover may claim to be. Anything else is treated as "no cover":
# serving `text/html` out of a user-uploaded archive from the API's own
# origin is stored XSS, and since #12 there is a session cookie on that
# origin to steal.
COVER_MEDIA_TYPES = frozenset({"image/jpeg", "image/png", "image/gif", "image/webp"})

SORT_TITLE = "title"
SORT_ADDED = "added"
# Default is title: what a browsing reader expects. `added` suits a library
# being actively filled.
BookSort = Literal["title", "added"]


def utcnow() -> datetime:
    """Current UTC time as a naive datetime."""
    return datetime.now(UTC).replace(tzinfo=None)


class BookBase(SQLModel):
    """What every view of a book has in common."""

    title: str
    author: str
    format: str
    file_path: str
    year: int | None = Field(default=None)
    blurb: str | None = Field(default=None)
    pages: int | None = Field(default=None)
    book_metadata: dict = Field(default_factory=dict, sa_column=Column(SA_JSON))


class Book(BookBase, table=True):
    """A book in the catalog."""

    id: int | None = Field(default=None, primary_key=True)
    uploaded_by: int | None = Field(default=None, foreign_key="user.id")


class BookCreate(BookBase):
    pass


class BookRead(BookBase):
    """A book as one particular reader sees it."""

    id: int
    uploaded_by: int | None = None
    has_cover: bool = False
    shelf_id: int | None = None
    tag_ids: list[int] = []
    rating: int = 0
    progress: float = 0.0
    position: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    last_sent_at: datetime | None = None


class BookList(SQLModel):
    """A page of results."""

    items: list[BookRead]
    total: int


class BookUpdate(SQLModel):
    """Partial update for a book's metadata."""

    title: str | None = None
    author: str | None = None
    format: str | None = None
    year: int | None = None
    blurb: str | None = None
    pages: int | None = Field(default=None, ge=1)
    book_metadata: dict | None = None


class User(SQLModel, table=True):
    """A person with an account on this instance."""

    id: int | None = Field(default=None, primary_key=True)
    username: str = Field(unique=True, index=True)
    password_hash: str
    is_admin: bool = Field(default=False)
    kindle_email: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=utcnow)


class UserSession(SQLModel, table=True):
    """A logged-in session, keyed by the hash of its cookie token."""

    __tablename__ = "user_session"

    token_hash: str = Field(primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    kind: str = Field(default="browser")
    expires_at: datetime
    created_at: datetime = Field(default_factory=utcnow)


class Shelf(SQLModel, table=True):
    """A named, ordered grouping of books belonging to one reader."""

    __tablename__ = "shelf"
    __table_args__ = (Index("ix_shelf_owner_name", "owner_id", "name", unique=True),)

    id: int | None = Field(default=None, primary_key=True)
    owner_id: int = Field(foreign_key="user.id", index=True)
    name: str = Field(sa_column=Column("name", String(collation="NOCASE"), nullable=False))
    position: int = Field(default=0)
    visibility: str = Field(default=SHELF_PRIVATE)
    created_at: datetime = Field(default_factory=utcnow)


class ShelfCreate(SQLModel):
    name: str
    visibility: ShelfVisibility = SHELF_PRIVATE


class ShelfUpdate(SQLModel):
    """Omitted means unchanged; `name` and `visibility` are the only fields a caller may set."""

    name: str | None = None
    visibility: ShelfVisibility | None = None


class ShelfRead(SQLModel):
    """A shelf as one caller sees it."""

    id: int
    owner_id: int
    owner_username: str = ""
    name: str
    position: int
    visibility: str
    book_count: int = 0
    editable: bool = False


class ShelfOrder(SQLModel):
    """The caller's complete shelf list, in the order they want it."""

    shelf_ids: list[int]


class Tag(SQLModel, table=True):
    """A label on a book."""

    __tablename__ = "tag"
    __table_args__ = (
        Index("ix_tag_owner_name", "owner_id", "name", unique=True),
        Index(
            "ix_tag_global_name",
            "name",
            unique=True,
            sqlite_where=text("owner_id IS NULL"),
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    owner_id: int | None = Field(default=None, foreign_key="user.id", index=True)
    name: str = Field(sa_column=Column("name", String(collation="NOCASE"), nullable=False))
    created_at: datetime = Field(default_factory=utcnow)


class BookTag(SQLModel, table=True):
    """Which books carry which tags."""

    __tablename__ = "book_tag"

    book_id: int = Field(foreign_key="book.id", primary_key=True)
    tag_id: int = Field(foreign_key="tag.id", primary_key=True)


class TagCreate(SQLModel):
    name: str


class TagUpdate(SQLModel):
    name: str | None = None


class TagRead(SQLModel):
    """A tag as one caller sees it."""

    id: int
    name: str
    owner_id: int | None = None
    is_global: bool = False
    book_count: int = 0
    editable: bool = False


class UserBookState(SQLModel, table=True):
    """One reader's relationship with one book."""

    __tablename__ = "user_book_state"

    user_id: int = Field(foreign_key="user.id", primary_key=True)
    book_id: int = Field(foreign_key="book.id", primary_key=True)
    shelf_id: int | None = Field(default=None, foreign_key="shelf.id")
    rating: int = Field(default=0)  # 0 = unrated
    progress: float = Field(default=0.0)
    # Exactly where the reader stopped, in the reading client's own terms. For EPUB that is an
    # epub.js CFI. `progress` says how far through the book that is, for the bar and the shelf;
    # this says where, and it is what the reader is put back to. The two are kept apart because
    # a percentage cannot be turned back into a place: doing so goes through a measurement of
    # the book taken from a different parse of it than the one on screen, and on some real books
    # the answer lands nowhere. Opaque to the server, which never reads it.
    position: str | None = Field(default=None)
    started_at: datetime | None = Field(default=None)
    finished_at: datetime | None = Field(default=None)
    last_sent_at: datetime | None = Field(default=None)
    updated_at: datetime = Field(default_factory=utcnow)


class UserBookStateWrite(SQLModel):
    """The writable half of a reader's state."""

    rating: int = Field(default=0, ge=0, le=5)
    progress: float = Field(default=0.0, ge=0, le=1)
    position: str | None = Field(default=None, max_length=1000)
    shelf_id: int | None = None
    tag_ids: list[int] | None = None


class Note(SQLModel, table=True):
    """A reader's note or highlight."""

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    book_id: int = Field(foreign_key="book.id", index=True)
    text: str
    page: int | None = Field(default=None)
    created_at: datetime = Field(default_factory=utcnow)


class NoteCreate(SQLModel):
    """The writable half of a note."""

    text: str
    page: int | None = Field(default=None, ge=1)


class NoteUpdate(SQLModel):
    """Every field optional, so a caller may send only what changed."""

    text: str | None = None
    page: int | None = Field(default=None, ge=1)


class NoteRead(SQLModel):
    """No `user_id`: every note a caller can read is their own, so publishing the field would
    only ever restate the session.
    """

    id: int
    book_id: int
    text: str
    page: int | None
    created_at: datetime


MessageRole = Literal["user", "librarian"]


class Conversation(SQLModel, table=True):
    """One reader's ongoing exchange with the librarian — one per reader."""

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    title: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=utcnow)


class Message(SQLModel, table=True):
    """One turn in a conversation, from the reader or the librarian."""

    id: int | None = Field(default=None, primary_key=True)
    conversation_id: int = Field(foreign_key="conversation.id", index=True)
    # `sa_type` explicit: SQLModel 0.0.39 cannot derive a column type from a
    # bare `Literal` annotation on a table model (it isn't a subclass of
    # `Enum`), and raises a `TypeError` at class-creation time without this.
    # Does not restore validation — table=True classes never enforce a Literal.
    role: MessageRole = Field(sa_type=String)
    content: str
    created_at: datetime = Field(default_factory=utcnow)
    # Tool-call status and citation, so Phase 3 can add to this shape
    # without a migration — the same reasoning as `book_metadata`.
    meta: dict = Field(default_factory=dict, sa_column=Column(SA_JSON))


class MessageCreate(SQLModel):
    """What a reader sends: the question, nothing else."""

    content: str


class MessageRead(SQLModel):
    id: int
    role: MessageRole
    content: str
    created_at: datetime
    meta: dict


class ConversationRead(SQLModel):
    id: int
    messages: list[MessageRead]


class UserCreate(SQLModel):
    username: str
    password: str
    is_admin: bool = False
    kindle_email: str | None = None


class UserRead(SQLModel):
    """Defined standalone, never derived from `User`, so that adding a field to the table
    cannot silently start publishing it — `password_hash` in particular.
    """

    id: int
    username: str
    is_admin: bool
    kindle_email: str | None
    created_at: datetime


class CurrentUserRead(UserRead):
    """`UserRead` plus the server configuration the caller needs to act on."""

    kindle_sender: str | None = None


class UserUpdate(SQLModel):
    password: str | None = None
    kindle_email: str | None = None
    is_admin: bool | None = None


class LoginRequest(SQLModel):
    username: str
    password: str


class KindleDeliveryRead(SQLModel):
    """What a send attempt reports back."""

    book_id: int
    sent_to: str
    attempted_at: datetime
