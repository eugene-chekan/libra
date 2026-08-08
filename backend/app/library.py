"""Library operations, independent of HTTP.

The first module written under docs/specs/layering.md. It exists because
Phase 3's agent needs `get_book_metadata` and `search_library` to return
exactly what the REST API returns, including the rules about what the calling
user may see. Logic that lives in a route handler can only be reached by the
agent through duplication or a self-directed HTTP call, and duplication means
two implementations of the scoping rules.

Nothing here raises `HTTPException`. Domain functions return domain values;
routers map them to status codes. A service that raised HTTP would force the
agent to catch HTTP exceptions in order to read a book.
"""

from collections.abc import Callable
from datetime import datetime
from pathlib import Path

from sqlalchemy import func
from sqlmodel import Session, select

from app import mailer, storage
from app.config import Settings
from app.models import (
    SHELF_PUBLIC,
    Book,
    BookRead,
    Shelf,
    ShelfRead,
    User,
    UserBookState,
    utcnow,
)


class NoKindleAddressError(Exception):
    """The caller has not told us where to send their books."""


class ShelfNotVisibleError(Exception):
    """No such shelf, or none this caller is allowed to know about.

    One error for both cases on purpose. Distinguishing them would let a
    caller enumerate other people's private shelves by walking ids.
    """


class ShelfNotOwnedError(Exception):
    """The shelf exists and is visible, but belongs to somebody else."""


class DuplicateShelfNameError(Exception):
    """This reader already has a shelf with that name."""


class InvalidShelfOrderError(Exception):
    """A reorder that is not a permutation of the caller's own shelves."""


class AttachmentTooLargeError(Exception):
    """The encoded message would exceed what Send to Kindle accepts."""

    def __init__(self, limit_bytes: int) -> None:
        super().__init__(f"exceeds the {limit_bytes} byte attachment limit")
        self.limit_bytes = limit_bytes


def _merge(book: Book, state: UserBookState | None) -> BookRead:
    """Combine a shared catalog row with one reader's state.

    A missing state row is not an error — rows are created lazily, so most
    books have none for most users, and the defaults on `BookRead` are the
    correct answer for "never touched this book".
    """
    view = BookRead.model_validate(book, from_attributes=True)
    if state is not None:
        view.shelf_id = state.shelf_id
        view.rating = state.rating
        view.progress = state.progress
        view.started_at = state.started_at
        view.finished_at = state.finished_at
        view.last_sent_at = state.last_sent_at
    return view


def get_book(session: Session, book_id: int, user: User) -> BookRead | None:
    """One book as `user` sees it, or None if there is no such book."""
    book = session.get(Book, book_id)
    if book is None:
        return None
    return _merge(book, session.get(UserBookState, (user.id, book_id)))


def list_books(session: Session, user: User) -> list[BookRead]:
    """Every book, each carrying `user`'s own state.

    Deliberately one round trip. The obvious implementation — fetch the books,
    then look up a state row per book — is an N+1 that grows with the library
    and is invisible until someone has a few hundred books. The outer join
    keeps it at a single query, and `test_list_books_is_not_n_plus_one` fails
    if that regresses.

    LEFT OUTER JOIN rather than inner: a book nobody has touched must still
    appear, which is most of them.
    """
    rows = session.exec(
        select(Book, UserBookState)
        .outerjoin(
            UserBookState,
            (UserBookState.book_id == Book.id) & (UserBookState.user_id == user.id),
        )
        .order_by(Book.id)
    ).all()
    return [_merge(book, state) for book, state in rows]


def set_reading_state(
    session: Session,
    book: Book,
    user: User,
    rating: int,
    progress: float,
    shelf_id: int | None = None,
    set_shelf: bool = False,
) -> BookRead:
    """Write `user`'s state for `book`, creating the row if it is the first touch.

    Timestamps are derived here rather than accepted from the client: they
    describe when the server observed a change, and a client that could set
    them could claim to have finished a book last year.

    `set_shelf` distinguishes an omitted `shelf_id` (leave the placement
    alone) from an explicit null (take the book off its shelf).
    """
    state = session.get(UserBookState, (user.id, book.id))
    if state is None:
        state = UserBookState(user_id=user.id, book_id=book.id)

    if set_shelf:
        if shelf_id is not None:
            # The rule no foreign key expresses: a reader may only place books
            # on their *own* shelves. The column's FK would happily accept
            # somebody else's id — and with SQLite's foreign keys off by
            # default, it would accept a nonexistent one too.
            owned_shelf(session, shelf_id, user)
        state.shelf_id = shelf_id

    now = utcnow()

    # Set once, on the first evidence of reading, and never cleared: a re-read
    # does not change when this reader first opened the book.
    if progress > 0 and state.started_at is None:
        state.started_at = now

    if progress >= 1:
        # Re-finishing does not move the date; the first completion is the one
        # worth remembering.
        if state.finished_at is None:
            state.finished_at = now
    else:
        # Dropping back below 1 means it is being read again, so the book is
        # no longer finished. Leaving the stamp would make "finished" mean
        # "finished at some point", which no view wants.
        state.finished_at = None

    state.rating = rating
    state.progress = progress
    state.updated_at = now

    session.add(state)
    session.commit()
    session.refresh(state)
    return _merge(book, state)


# --- shelves --------------------------------------------------------------


def _visible_shelf(session: Session, shelf_id: int, user: User) -> Shelf:
    """A shelf the caller is allowed to see, or `ShelfNotVisibleError`.

    Admins get no special access here. Admin is a curation role over shared
    things — the catalog, the global tag vocabulary — not a way to read what
    a household member marked private. "Private except from the admin" would
    make the setting worthless.
    """
    shelf = session.get(Shelf, shelf_id)
    if shelf is None:
        raise ShelfNotVisibleError
    if shelf.owner_id != user.id and shelf.visibility != SHELF_PUBLIC:
        raise ShelfNotVisibleError
    return shelf


def owned_shelf(session: Session, shelf_id: int, user: User) -> Shelf:
    """A shelf the caller may modify.

    Public shelves are readable by everyone and writable by nobody but their
    owner, so visibility is resolved first: a caller who cannot see a shelf
    is told it does not exist, and one who can see it but does not own it is
    told they may not touch it.
    """
    shelf = _visible_shelf(session, shelf_id, user)
    if shelf.owner_id != user.id:
        raise ShelfNotOwnedError
    return shelf


def _assert_name_free(
    session: Session, user: User, name: str, exclude_id: int | None = None
) -> None:
    """Reject a duplicate before the database does.

    The unique index is the real guarantee; this exists to turn an
    IntegrityError into a 409 with a sentence a person can act on.
    """
    query = select(Shelf).where(Shelf.owner_id == user.id, Shelf.name == name)
    existing = session.exec(query).first()
    if existing is not None and existing.id != exclude_id:
        raise DuplicateShelfNameError


def _book_counts(session: Session, shelf_ids: list[int]) -> dict[int, int]:
    """How many books sit on each shelf, in one grouped query.

    Counting per shelf in a loop is the same N+1 the book listing avoids, and
    the Shelves page renders a count against every shelf at once.
    """
    if not shelf_ids:
        return {}
    rows = session.exec(
        select(UserBookState.shelf_id, func.count())
        .where(UserBookState.shelf_id.in_(shelf_ids))
        .group_by(UserBookState.shelf_id)
    ).all()
    return {shelf_id: count for shelf_id, count in rows}


def _to_read(shelf: Shelf, user: User, counts: dict[int, int]) -> ShelfRead:
    return ShelfRead(
        id=shelf.id,
        owner_id=shelf.owner_id,
        name=shelf.name,
        position=shelf.position,
        visibility=shelf.visibility,
        book_count=counts.get(shelf.id, 0),
        editable=shelf.owner_id == user.id,
    )


def list_shelves(session: Session, user: User) -> list[ShelfRead]:
    """The caller's own shelves in their chosen order, then others' public ones."""
    shelves = session.exec(
        select(Shelf)
        .where((Shelf.owner_id == user.id) | (Shelf.visibility == SHELF_PUBLIC))
        .order_by(Shelf.owner_id != user.id, Shelf.position, Shelf.id)
    ).all()
    counts = _book_counts(session, [shelf.id for shelf in shelves])
    return [_to_read(shelf, user, counts) for shelf in shelves]


def get_shelf(session: Session, shelf_id: int, user: User) -> ShelfRead:
    shelf = _visible_shelf(session, shelf_id, user)
    return _to_read(shelf, user, _book_counts(session, [shelf.id]))


def create_shelf(session: Session, user: User, name: str, visibility: str) -> ShelfRead:
    """Append a shelf at the end of the caller's order."""
    name = name.strip()
    _assert_name_free(session, user, name)

    last = session.exec(select(func.max(Shelf.position)).where(Shelf.owner_id == user.id)).one()
    shelf = Shelf(
        owner_id=user.id,
        name=name,
        visibility=visibility,
        position=0 if last is None else last + 1,
    )
    session.add(shelf)
    session.commit()
    session.refresh(shelf)
    return _to_read(shelf, user, {})


def update_shelf(session: Session, shelf_id: int, user: User, fields: dict) -> ShelfRead:
    """Rename a shelf or change its visibility.

    A rename moves nothing: books reference the shelf by id, which is the
    whole reason shelves are entities rather than the design prototype's
    name-matched strings.
    """
    shelf = owned_shelf(session, shelf_id, user)

    if "name" in fields:
        name = (fields["name"] or "").strip()
        if not name:
            raise ValueError("Shelf name must not be empty")
        _assert_name_free(session, user, name, exclude_id=shelf.id)
        shelf.name = name

    if "visibility" in fields:
        shelf.visibility = fields["visibility"]

    session.add(shelf)
    session.commit()
    session.refresh(shelf)
    return _to_read(shelf, user, _book_counts(session, [shelf.id]))


def delete_shelf(
    session: Session, shelf_id: int, user: User, reassign_to: int | None = None
) -> None:
    """Delete a shelf, moving its books somewhere first if asked.

    One transaction, because the modal asks one question — "move N books to X
    and delete this shelf?". A client issuing a delete plus N placement
    updates can fail halfway and leave books pointing at a shelf that no
    longer exists, which is exactly the orphaning that stable ids were
    introduced to prevent.

    `reassign_to` omitted means those books become unshelved, which is a
    valid state. The prototype's fallback of reassigning to the first
    remaining shelf is deliberately not reproduced: it moves a reader's books
    somewhere they did not ask for.
    """
    shelf = owned_shelf(session, shelf_id, user)

    destination: Shelf | None = None
    if reassign_to is not None:
        if reassign_to == shelf_id:
            raise ValueError("Cannot reassign a shelf's books to itself")
        destination = owned_shelf(session, reassign_to, user)

    placed = session.exec(select(UserBookState).where(UserBookState.shelf_id == shelf.id)).all()
    for state in placed:
        state.shelf_id = destination.id if destination is not None else None
        session.add(state)

    session.delete(shelf)
    # Reassignment and deletion land together or not at all.
    session.commit()


def reorder_shelves(session: Session, user: User, shelf_ids: list[int]) -> list[ShelfRead]:
    """Rewrite every position from one ordered list.

    Bulk rather than per-row: it matches the manage dialog's commit-on-save
    behaviour, it is atomic, and it cannot produce the duplicate or gapped
    positions that concurrent single-row updates race into.

    The list must be exactly the caller's current shelves. Anything else is a
    stale client, and rejecting it also stops another user's shelf id being
    slipped into the ordering.
    """
    owned = session.exec(select(Shelf).where(Shelf.owner_id == user.id)).all()
    if sorted(shelf_ids) != sorted(shelf.id for shelf in owned):
        raise InvalidShelfOrderError

    by_id = {shelf.id: shelf for shelf in owned}
    for position, shelf_id in enumerate(shelf_ids):
        by_id[shelf_id].position = position
        session.add(by_id[shelf_id])
    session.commit()

    return list_shelves(session, user)


def send_to_kindle(
    session: Session,
    book: Book,
    user: User,
    settings: Settings,
    send: Callable[[object, Settings], None],
) -> datetime:
    """Mail `book` to `user`'s Kindle address; returns when it was attempted.

    "Attempted" is the strongest word available. Amazon silently discards mail
    from an address that is not on the recipient's approved-sender list — no
    bounce, no status API — so SMTP acceptance is the only observable signal
    and nothing here can promise the book arrived.

    Everything checkable is checked before anything with a side effect, and
    `last_sent_at` is written only after the mail server accepts: a failed
    send must not leave a record claiming the book went out.
    """
    if not user.kindle_email:
        raise NoKindleAddressError

    # Reuses the existing traversal guard rather than adding a second one.
    path: Path = storage.resolve(book.file_path, settings.library_dir)
    content = path.read_bytes()

    if mailer.encoded_size(len(content)) > settings.kindle_max_attachment_bytes:
        raise AttachmentTooLargeError(settings.kindle_max_attachment_bytes)

    message = mailer.build_message(
        to_address=user.kindle_email,
        settings=settings,
        title=book.title,
        author=book.author,
        content=content,
        filename=mailer.attachment_filename(book.title, book.author),
    )
    send(message, settings)

    attempted_at = utcnow()
    state = session.get(UserBookState, (user.id, book.id))
    if state is None:
        state = UserBookState(user_id=user.id, book_id=book.id)
    state.last_sent_at = attempted_at
    state.updated_at = attempted_at
    session.add(state)
    session.commit()

    return attempted_at
