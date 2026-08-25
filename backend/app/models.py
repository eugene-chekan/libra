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
    # So a grid of covers does not fire one request per book that 404s on
    # first paint. The design's gradient fallback is rendered client-side and
    # needs no round trip to decide on.
    has_cover: bool = False
    shelf_id: int | None = None
    # Global tags plus the caller's own. Never another reader's.
    tag_ids: list[int] = []
    rating: int = 0
    progress: float = 0.0
    started_at: datetime | None = None
    finished_at: datetime | None = None
    last_sent_at: datetime | None = None


class BookList(SQLModel):
    """A page of results.

    An envelope rather than a bare list, decided before pagination exists:
    the designed header shows a book count, and changing the response shape
    later would break every client at once. `total` equals `len(items)` while
    nothing is paginated.
    """

    items: list[BookRead]
    total: int


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


class Shelf(SQLModel, table=True):
    """A named, ordered grouping of books belonging to one reader.

    Always owned; there is no global shelf. That follows from what shelves
    *mean* in the design — "Currently Reading", "Completed", "To Read" are
    statements about a reader, not about a book, and a shared "Currently
    Reading" would stop meaning anything the moment two people used it.

    `visibility = "public"` makes a shelf **readable** by others, never
    writable. Viewing one necessarily exposes the owner's progress on those
    books, since the design draws a progress bar under each cover; that is an
    intended consequence of publishing a shelf rather than a leak.
    """

    __tablename__ = "shelf"
    # Unique per owner and case-insensitive, so one reader cannot hold both
    # "To Read" and "to read". Enforced by COLLATE NOCASE on the column rather
    # than a normalised shadow column or an index over lower(name): shelf
    # names are display text and must keep their casing, and an expression
    # index renders badly enough in autogenerate to leave `alembic check`
    # permanently red. Caveat: SQLite's NOCASE folds ASCII only, so "Café" and
    # "CAFÉ" would both be accepted. A Postgres move would want citext.
    __table_args__ = (Index("ix_shelf_owner_name", "owner_id", "name", unique=True),)

    id: int | None = Field(default=None, primary_key=True)
    owner_id: int = Field(foreign_key="user.id", index=True)
    name: str = Field(sa_column=Column("name", String(collation="NOCASE"), nullable=False))
    # Contiguous from 0 within an owner. The Shelves page renders blocks in
    # this order and the manage dialog reorders them.
    position: int = Field(default=0)
    visibility: str = Field(default=SHELF_PRIVATE)
    created_at: datetime = Field(default_factory=utcnow)


class ShelfCreate(SQLModel):
    name: str
    visibility: ShelfVisibility = SHELF_PRIVATE


class ShelfUpdate(SQLModel):
    """Omitted means unchanged; `name` and `visibility` are the only fields a
    caller may set. `position` moves through `PUT /shelves/order` instead, so
    that reordering is one atomic decision rather than a race between rows."""

    name: str | None = None
    visibility: ShelfVisibility | None = None


class ShelfRead(SQLModel):
    id: int
    owner_id: int
    # Whose shelf this is, by name. Only useful for somebody else's public
    # shelf, which the client labels "by {username}" — and only reachable
    # here, since listing users is admin-only and a reader must still be able
    # to tell one shared shelf from another. Publishing a shelf is a
    # deliberate act that already discloses its owner to every reader.
    owner_username: str = ""
    name: str
    position: int
    visibility: str
    book_count: int = 0
    # True when the caller may modify it. Saves the client re-deriving the
    # rule from owner_id, and keeps the answer in one place.
    editable: bool = False


class ShelfOrder(SQLModel):
    """The caller's complete shelf list, in the order they want it."""

    shelf_ids: list[int]


class Tag(SQLModel, table=True):
    """A label on a book. Either curated for everyone, or private to a reader.

    `owner_id IS NULL` means a **global** tag, maintained by an admin and
    visible to everyone. A non-null owner means a **personal** tag, visible
    only to them. The vocabulary a reader sees is global ∪ own.

    The split earns its complexity because the two kinds genuinely differ:
    "Sci-Fi" is a fact about the book that a household should agree on, while
    "Read before the trip" is nobody else's business.
    """

    __tablename__ = "tag"
    __table_args__ = (
        # Personal tags: unique per owner, case-insensitive via NOCASE.
        Index("ix_tag_owner_name", "owner_id", "name", unique=True),
        # Global tags need their own index. NULL never equals NULL in SQLite,
        # so the composite index above lets an unlimited number of global
        # "Sci-Fi" rows coexist — verified, not assumed. A partial index over
        # just the globals closes that, and unlike the `coalesce(owner_id, 0)`
        # expression index the spec proposed, autogenerate renders it cleanly
        # and `alembic check` stays quiet.
        Index(
            "ix_tag_global_name",
            "name",
            unique=True,
            sqlite_where=text("owner_id IS NULL"),
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    owner_id: int | None = Field(default=None, foreign_key="user.id", index=True)
    # NOCASE for the same reason as shelves: tag names are display text and
    # must keep their casing, so lowercasing them the way usernames are
    # lowercased is not an option. ASCII-only folding.
    name: str = Field(sa_column=Column("name", String(collation="NOCASE"), nullable=False))
    created_at: datetime = Field(default_factory=utcnow)


class BookTag(SQLModel, table=True):
    """Which books carry which tags.

    Deliberately carries no `user_id`. A personal tag is only visible to its
    owner, so a row pointing at one inherits that visibility automatically —
    scoping flows from `Tag.owner_id` and never has to be restated. A global
    tag's assignment is likewise global.
    """

    __tablename__ = "book_tag"

    book_id: int = Field(foreign_key="book.id", primary_key=True)
    tag_id: int = Field(foreign_key="tag.id", primary_key=True)


class TagCreate(SQLModel):
    name: str


class TagUpdate(SQLModel):
    name: str | None = None


class TagRead(SQLModel):
    id: int
    name: str
    # Null for a global tag. Present rather than a bare `is_global` flag so a
    # client can tell "mine" from "someone else's" — though the latter is
    # never returned, since personal tags are only ever the caller's own.
    owner_id: int | None = None
    is_global: bool = False
    book_count: int = 0
    editable: bool = False


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
    # Null means "on no shelf", which is the default and a perfectly valid
    # state. The composite key above is what makes "at most one shelf per
    # user per book" structural rather than a constraint to enforce.
    #
    # No foreign key expresses the rule that actually matters — that the shelf
    # belongs to `user_id` — so it is checked in `library.set_reading_state`,
    # and therefore needs its own test.
    shelf_id: int | None = Field(default=None, foreign_key="shelf.id")
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
    # Omitted leaves the current placement alone; explicit null takes the book
    # off its shelf. `exclude_unset` in the router is what tells them apart.
    shelf_id: int | None = None
    # Omitted leaves tags alone; supplied replaces the tags this caller may
    # set on this book, wholesale. For a reader that is their own personal
    # tags, and the book's global ones are untouched. An admin may set global
    # tags here too, and theirs are replaced as well — what a write may add,
    # it may also take away.
    tag_ids: list[int] | None = None


class Note(SQLModel, table=True):
    """A reader's note or highlight.

    The table was defined in Phase 1 with no endpoints, because Phase 2 builds
    RAG ingestion over these same tables and adding it then would mean a
    schema change at exactly the moment the vector store is being wired up.
    Highlights are also unusually good retrieval material — they are the
    passages a reader already decided were worth keeping.

    The endpoints arrived in Phase 4 rather than Phase 2, once the Book Detail
    design turned out to need them. Defining the shape early is what made that
    cheap.
    """

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    book_id: int = Field(foreign_key="book.id", index=True)
    text: str
    page: int | None = Field(default=None)
    created_at: datetime = Field(default_factory=utcnow)


class NoteCreate(SQLModel):
    """The writable half of a note.

    The `page` bound lives here rather than on `Note` because SQLModel does
    not validate `table=True` classes — `Note(page=-5)` is accepted in
    silence. The constraint only bites on a non-table model, which makes this
    the one the endpoint takes.
    """

    text: str
    page: int | None = Field(default=None, ge=1)


class NoteUpdate(SQLModel):
    """Every field optional, so a caller may send only what changed.

    `page` is nullable *and* clearable, so an explicit null has to be
    distinguishable from an omitted key. `exclude_unset` in the router is what
    tells them apart, the same way `shelf_id` works on reading state.
    """

    text: str | None = None
    page: int | None = Field(default=None, ge=1)


class NoteRead(SQLModel):
    """No `user_id`: every note a caller can read is their own, so publishing
    the field would only ever restate the session."""

    id: int
    book_id: int
    text: str
    page: int | None
    created_at: datetime


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


class CurrentUserRead(UserRead):
    """`UserRead` plus the server configuration the caller needs to act on.

    Only on /auth/me, never on /users — the sender address is instance
    config, not a property of a user, and repeating it per row in a listing
    would imply otherwise.
    """

    kindle_sender: str | None = None


class UserUpdate(SQLModel):
    password: str | None = None
    kindle_email: str | None = None
    is_admin: bool | None = None


class LoginRequest(SQLModel):
    username: str
    password: str


class KindleDeliveryRead(SQLModel):
    """What a send attempt reports back.

    `attempted_at`, not `sent_at`. Amazon discards mail from an unapproved
    sender without a bounce, so handing the message to the mail server is the
    last observable event — the field name should not claim more than that.
    """

    book_id: int
    sent_to: str
    attempted_at: datetime
