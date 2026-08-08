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

from sqlmodel import Session, select

from app import mailer, storage
from app.config import Settings
from app.models import Book, BookRead, User, UserBookState, utcnow


class NoKindleAddressError(Exception):
    """The caller has not told us where to send their books."""


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
    session: Session, book: Book, user: User, rating: int, progress: float
) -> BookRead:
    """Write `user`'s state for `book`, creating the row if it is the first touch.

    Timestamps are derived here rather than accepted from the client: they
    describe when the server observed a change, and a client that could set
    them could claim to have finished a book last year.
    """
    state = session.get(UserBookState, (user.id, book.id))
    if state is None:
        state = UserBookState(user_id=user.id, book_id=book.id)

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
