"""Library operations, independent of HTTP."""

from collections.abc import Callable
from datetime import datetime
from pathlib import Path

from sqlalchemy import func
from sqlmodel import Session, col, select

from app import epub, mailer, naming, storage
from app.config import Settings
from app.models import (
    COVER_MEDIA_TYPES,
    SHELF_PUBLIC,
    SORT_ADDED,
    SORT_TITLE,
    Book,
    BookRead,
    BookTag,
    Note,
    NoteRead,
    Shelf,
    ShelfRead,
    Tag,
    TagRead,
    User,
    UserBookState,
    UserSession,
    utcnow,
)


class NoKindleAddressError(Exception):
    """The caller has not told us where to send their books."""


class ShelfNotVisibleError(Exception):
    """No such shelf, or none this caller is allowed to know about."""


class ShelfNotOwnedError(Exception):
    """The shelf exists and is visible, but belongs to somebody else."""


class DuplicateShelfNameError(Exception):
    """This reader already has a shelf with that name."""


class InvalidShelfOrderError(Exception):
    """A reorder that is not a permutation of the caller's own shelves."""


class TagNotVisibleError(Exception):
    """No such tag, or one belonging to another reader."""


class TagNotEditableError(Exception):
    """A global tag, and the caller is not an admin."""


class DuplicateTagNameError(Exception):
    """That name is already taken in the scope being written to."""


class ShadowsGlobalTagError(Exception):
    """A personal tag may not take the name of a global one."""


class BookNotFoundError(Exception):
    """No such book."""


class NoteNotFoundError(Exception):
    """No such note, or one belonging to another reader."""


class BookFileMissingError(Exception):
    """The row is there but the file it points at is not."""


class NoCoverError(Exception):
    """This book has no usable cover."""


class AttachmentTooLargeError(Exception):
    """The encoded message would exceed what Send to Kindle accepts."""

    def __init__(self, limit_bytes: int) -> None:
        super().__init__(f"exceeds the {limit_bytes} byte attachment limit")
        self.limit_bytes = limit_bytes


def _merge(book: Book, state: UserBookState | None, tag_ids: list[int] | None = None) -> BookRead:
    """Combine a shared catalog row with one reader's state."""
    view = BookRead.model_validate(book, from_attributes=True)
    view.tag_ids = tag_ids or []
    view.has_cover = bool(
        book.book_metadata.get("cover_href")
        and book.book_metadata.get("cover_media_type") in COVER_MEDIA_TYPES
    )
    if state is not None:
        view.shelf_id = state.shelf_id
        view.rating = state.rating
        view.progress = state.progress
        view.started_at = state.started_at
        view.finished_at = state.finished_at
        view.last_sent_at = state.last_sent_at
    return view


def get_book(session: Session, book_id: int, user: User) -> BookRead | None:
    """One book as `user` sees it, or None if there is no such book.

    Args:
        session: Open database session.
        book_id: Id of the book to read.
        user: Whose state is merged into the result.
    """
    book = session.get(Book, book_id)
    if book is None:
        return None
    return _merge(
        book,
        session.get(UserBookState, (user.id, book_id)),
        book_tag_ids(session, book_id, user),
    )


def list_books(session: Session, user: User) -> list[BookRead]:
    """Every book, each carrying `user`'s own state. Unfiltered `search_books`.

    Args:
        session: Open database session.
        user: Whose state is merged into each book.
    """
    items, _ = search_books(session, user)
    return items


def cover_for(session: Session, book: Book, settings: Settings) -> tuple[bytes, str, str]:
    """A book's cover image, its media type, and an ETag.

    Args:
        session: Open database session.
        book: The book whose cover to read.
        settings: Supplies `library_dir` and the cover size cap.

    Returns:
        The image bytes, its media type, and an ETag.

    Raises:
        NoCoverError: The book declares no usable cover.
    """
    href = book.book_metadata.get("cover_href")
    media_type = book.book_metadata.get("cover_media_type")
    if not href or media_type not in COVER_MEDIA_TYPES:
        raise NoCoverError

    path = storage.resolve(book.file_path, settings.library_dir)
    try:
        data = epub.read_cover(path, href, settings.max_cover_bytes)
    except (epub.InvalidEpubError, FileNotFoundError) as exc:
        raise NoCoverError from exc

    etag = f'"{book.book_metadata.get("sha256", book.id)}-{href}"'
    return data, media_type, etag


def file_for(session: Session, book: Book, settings: Settings) -> tuple[Path, str]:
    """The stored EPUB and the name to offer it under.

    Args:
        session: Open database session.
        book: The book whose file to serve.
        settings: Supplies `library_dir`.

    Returns:
        The path on disk, and the filename to offer it under.

    Raises:
        FileNotFoundError: The row points at a file that is not there.
    """
    path = storage.resolve(book.file_path, settings.library_dir)
    if not path.is_file():
        raise BookFileMissingError
    return path, naming.book_filename(book.title, book.author)


def search_books(
    session: Session,
    user: User,
    *,
    query: str | None = None,
    tag_ids: list[int] | None = None,
    shelf_id: int | None = None,
    sort: str = SORT_TITLE,
) -> tuple[list[BookRead], int]:
    """Find books, as `user` sees them.

    Args:
        session: Open database session.
        user: Whose visibility and state apply.
        query: Matched case-insensitively against title and author.
        tag_ids: Tags to match, ORed with each other.
        shelf_id: Shelf to match, ANDed against the rest.
        sort: `title` or `added`.

    Returns:
        The matching books and how many there are.

    Raises:
        TagNotVisibleError: A tag id this caller may not see.
        ShelfNotVisibleError: A shelf id this caller may not see.
    """
    statement = select(Book, UserBookState).outerjoin(
        UserBookState,
        (UserBookState.book_id == Book.id) & (UserBookState.user_id == user.id),
    )

    if tag_ids:
        for tag_id in tag_ids:
            visible_tag(session, tag_id, user)

        statement = statement.where(
            col(Book.id).in_(select(BookTag.book_id).where(col(BookTag.tag_id).in_(tag_ids)))
        )

    if shelf_id is not None:
        _visible_shelf(session, shelf_id, user)
        statement = statement.where(
            col(Book.id).in_(
                select(UserBookState.book_id).where(UserBookState.shelf_id == shelf_id)
            )
        )

    if query and query.strip():
        pattern = f"%{query.strip()}%"
        statement = statement.where(
            col(Book.title).ilike(pattern) | col(Book.author).ilike(pattern)
        )

    statement = statement.order_by(*_sort_clause(sort))

    rows = session.exec(statement).all()
    tags_by_book = _tags_by_book(session, user)
    items = [_merge(book, state, tags_by_book.get(book.id, [])) for book, state in rows]
    return items, len(items)


def _sort_clause(sort: str):
    if sort == SORT_ADDED:
        return (col(Book.id).desc(),)
    return (col(Book.title).collate("NOCASE").asc(), col(Book.id).asc())


def _tags_by_book(session: Session, user: User) -> dict[int, list[int]]:
    """Every visible tag assignment, grouped, in one query."""
    grouped: dict[int, list[int]] = {}
    for book_id, tag_id in session.exec(
        select(BookTag.book_id, BookTag.tag_id)
        .join(Tag, Tag.id == BookTag.tag_id)
        .where(_visible_tag_filter(user))
        .order_by(BookTag.book_id, BookTag.tag_id)
    ).all():
        grouped.setdefault(book_id, []).append(tag_id)
    return grouped


def set_reading_state(
    session: Session,
    book: Book,
    user: User,
    rating: int | None = None,
    progress: float | None = None,
    shelf_id: int | None = None,
    set_shelf: bool = False,
) -> BookRead:
    """Write `user`'s state for `book`, creating the row if it is the first touch.

    Args:
        session: Open database session.
        book: The book being written about.
        user: Whose state row this is.
        rating: 0 to 5, where 0 means unrated. None leaves it as it was.
        progress: 0 to 1. None leaves it as it was.
        shelf_id: Shelf to place the book on, or None to take it off.
        set_shelf: Whether `shelf_id` was supplied at all. The shelf needs a
            flag where rating and progress do not, because None is a real
            value here — it means no shelf.

    Raises:
        ShelfNotVisibleError: The shelf does not exist for this caller.
        ShelfNotOwnedError: The shelf belongs to somebody else.
    """
    state = session.get(UserBookState, (user.id, book.id))
    if state is None:
        state = UserBookState(user_id=user.id, book_id=book.id)

    if set_shelf:
        if shelf_id is not None:
            owned_shelf(session, shelf_id, user)
        state.shelf_id = shelf_id

    now = utcnow()

    if progress is not None:
        if progress > 0 and state.started_at is None:
            state.started_at = now

        if progress >= 1:
            if state.finished_at is None:
                state.finished_at = now
        else:
            state.finished_at = None

        state.progress = progress

    if rating is not None:
        state.rating = rating

    state.updated_at = now

    session.add(state)
    session.commit()
    session.refresh(state)
    return _merge(book, state, book_tag_ids(session, book.id, user))


# --- shelves --------------------------------------------------------------


def _visible_shelf(session: Session, shelf_id: int, user: User) -> Shelf:
    """A shelf the caller is allowed to see, or `ShelfNotVisibleError`."""
    shelf = session.get(Shelf, shelf_id)
    if shelf is None:
        raise ShelfNotVisibleError
    if shelf.owner_id != user.id and shelf.visibility != SHELF_PUBLIC:
        raise ShelfNotVisibleError
    return shelf


def owned_shelf(session: Session, shelf_id: int, user: User) -> Shelf:
    """A shelf the caller may modify.

    Args:
        session: Open database session.
        shelf_id: Id of the shelf.
        user: Who must own it.

    Raises:
        ShelfNotVisibleError: No such shelf for this caller.
        ShelfNotOwnedError: Visible, but not theirs.
    """
    shelf = _visible_shelf(session, shelf_id, user)
    if shelf.owner_id != user.id:
        raise ShelfNotOwnedError
    return shelf


def _assert_name_free(
    session: Session, user: User, name: str, exclude_id: int | None = None
) -> None:
    """Reject a duplicate before the database does."""
    query = select(Shelf).where(Shelf.owner_id == user.id, Shelf.name == name)
    existing = session.exec(query).first()
    if existing is not None and existing.id != exclude_id:
        raise DuplicateShelfNameError


def _book_counts(session: Session, shelf_ids: list[int]) -> dict[int, int]:
    """How many books sit on each shelf, in one grouped query."""
    if not shelf_ids:
        return {}
    rows = session.exec(
        select(UserBookState.shelf_id, func.count())
        .where(UserBookState.shelf_id.in_(shelf_ids))
        .group_by(UserBookState.shelf_id)
    ).all()
    return {shelf_id: count for shelf_id, count in rows}


def _to_read(
    shelf: Shelf,
    user: User,
    counts: dict[int, int],
    owner_names: dict[int, str] | None = None,
) -> ShelfRead:
    return ShelfRead(
        id=shelf.id,
        owner_id=shelf.owner_id,
        owner_username=(owner_names or {}).get(shelf.owner_id, user.username),
        name=shelf.name,
        position=shelf.position,
        visibility=shelf.visibility,
        book_count=counts.get(shelf.id, 0),
        editable=shelf.owner_id == user.id,
    )


def _owner_names(session: Session, owner_ids: list[int]) -> dict[int, str]:
    """Owner id to username, in one query rather than one per shelf."""
    if not owner_ids:
        return {}
    rows = session.exec(select(User.id, User.username).where(User.id.in_(owner_ids))).all()
    return {user_id: username for user_id, username in rows}


def list_shelves(session: Session, user: User) -> list[ShelfRead]:
    """The caller's own shelves in their chosen order, then others' public ones.

    Args:
        session: Open database session.
        user: Whose own shelves come first.
    """
    shelves = session.exec(
        select(Shelf)
        .where((Shelf.owner_id == user.id) | (Shelf.visibility == SHELF_PUBLIC))
        .order_by(Shelf.owner_id != user.id, Shelf.position, Shelf.id)
    ).all()
    counts = _book_counts(session, [shelf.id for shelf in shelves])
    names = _owner_names(session, [shelf.owner_id for shelf in shelves])
    return [_to_read(shelf, user, counts, names) for shelf in shelves]


def get_shelf(session: Session, shelf_id: int, user: User) -> ShelfRead:
    shelf = _visible_shelf(session, shelf_id, user)
    return _to_read(
        shelf,
        user,
        _book_counts(session, [shelf.id]),
        _owner_names(session, [shelf.owner_id]),
    )


def create_shelf(session: Session, user: User, name: str, visibility: str) -> ShelfRead:
    """Append a shelf at the end of the caller's order.

    Args:
        session: Open database session.
        user: Who will own it.
        name: Display name, unique per owner without regard to case.
        visibility: `private` or `public`.

    Raises:
        DuplicateShelfNameError: The owner already uses that name.
    """
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

    Args:
        session: Open database session.
        shelf_id: Id of the shelf.
        user: Who must own it.
        fields: Only the keys present are written.

    Raises:
        DuplicateShelfNameError: The new name is already taken.
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

    Args:
        session: Open database session.
        shelf_id: Id of the shelf.
        user: Who must own it.
        reassign_to: Another of their shelves to move the books to; None leaves
            them unshelved.
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
    session.commit()


def reorder_shelves(session: Session, user: User, shelf_ids: list[int]) -> list[ShelfRead]:
    """Rewrite every position from one ordered list.

    Args:
        session: Open database session.
        user: Whose shelves are being ordered.
        shelf_ids: Exactly their own shelves, each once, in the order wanted.

    Raises:
        InvalidShelfOrderError: The list is not that.
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


# --- tags -----------------------------------------------------------------


def _visible_tag_filter(user: User):
    """Global tags, plus the caller's own. Never another reader's."""
    return (Tag.owner_id.is_(None)) | (Tag.owner_id == user.id)


def visible_tag(session: Session, tag_id: int, user: User) -> Tag:
    tag = session.get(Tag, tag_id)
    if tag is None or (tag.owner_id is not None and tag.owner_id != user.id):
        raise TagNotVisibleError
    return tag


def _tag_counts(session: Session, tag_ids: list[int]) -> dict[int, int]:
    """Books per tag, in one grouped query rather than one query per tag."""
    if not tag_ids:
        return {}
    rows = session.exec(
        select(BookTag.tag_id, func.count())
        .where(BookTag.tag_id.in_(tag_ids))
        .group_by(BookTag.tag_id)
    ).all()
    return dict(rows)


def _tag_to_read(tag: Tag, user: User, counts: dict[int, int]) -> TagRead:
    return TagRead(
        id=tag.id,
        name=tag.name,
        owner_id=tag.owner_id,
        is_global=tag.owner_id is None,
        book_count=counts.get(tag.id, 0),
        editable=user.is_admin if tag.owner_id is None else tag.owner_id == user.id,
    )


def list_tags(session: Session, user: User) -> list[TagRead]:
    tags = session.exec(
        select(Tag)
        .where(_visible_tag_filter(user))
        .order_by(Tag.owner_id.is_(None).desc(), Tag.name)
    ).all()
    counts = _tag_counts(session, [tag.id for tag in tags])
    return [_tag_to_read(tag, user, counts) for tag in tags]


def _assert_tag_name_free(
    session: Session, user: User, name: str, is_global: bool, exclude_id: int | None = None
) -> None:
    """Reject a clash before the database does, and refuse to shadow a global."""
    global_match = session.exec(select(Tag).where(Tag.owner_id.is_(None), Tag.name == name)).first()
    if global_match is not None and global_match.id != exclude_id:
        raise ShadowsGlobalTagError if not is_global else DuplicateTagNameError

    if not is_global:
        own = session.exec(select(Tag).where(Tag.owner_id == user.id, Tag.name == name)).first()
        if own is not None and own.id != exclude_id:
            raise DuplicateTagNameError


def clean_tag_name(name: str) -> str:
    """Strip a tag name, and refuse one with whitespace inside it.

    Args:
        name: Raw name from the caller.

    Raises:
        ValueError: Empty, or containing a space.
    """
    name = name.strip()
    if not name:
        raise ValueError("Tag name must not be empty")
    if any(char.isspace() for char in name):
        raise ValueError("Tag names cannot contain spaces. Use a hyphen, like 'lent-out'.")
    return name


def create_tag(session: Session, user: User, name: str, is_global: bool) -> TagRead:
    name = clean_tag_name(name)
    if is_global and not user.is_admin:
        raise TagNotEditableError

    _assert_tag_name_free(session, user, name, is_global)

    tag = Tag(owner_id=None if is_global else user.id, name=name)
    session.add(tag)
    session.commit()
    session.refresh(tag)
    return _tag_to_read(tag, user, {})


def update_tag(session: Session, tag_id: int, user: User, name: str) -> TagRead:
    """Rename a tag. Moves nothing: books reference it by id.

    Args:
        session: Open database session.
        tag_id: Id of the tag.
        user: Must own it, or be an admin for a global one.
        name: The new name.

    Raises:
        TagNotEditableError: A non-admin renaming a global tag.
        DuplicateTagNameError: The name is taken in that scope.
    """
    tag = visible_tag(session, tag_id, user)
    if tag.owner_id is None and not user.is_admin:
        raise TagNotEditableError

    name = clean_tag_name(name)
    _assert_tag_name_free(session, user, name, tag.owner_id is None, exclude_id=tag.id)

    tag.name = name
    session.add(tag)
    session.commit()
    session.refresh(tag)
    return _tag_to_read(tag, user, _tag_counts(session, [tag.id]))


def delete_tag(session: Session, tag_id: int, user: User) -> None:
    """Delete a tag and remove it from every book, in one transaction.

    Args:
        session: Open database session.
        tag_id: Id of the tag.
        user: Must own it, or be an admin for a global one.
    """
    tag = visible_tag(session, tag_id, user)
    if tag.owner_id is None and not user.is_admin:
        raise TagNotEditableError

    for link in session.exec(select(BookTag).where(BookTag.tag_id == tag.id)).all():
        session.delete(link)
    session.delete(tag)
    session.commit()


def set_book_tags(session: Session, book: Book, user: User, tag_ids: list[int]) -> None:
    """Replace the tags this caller may set on a book.

    Args:
        session: Open database session.
        book: The book being tagged.
        user: Whose tags are replaced — plus the global ones when they are an
            admin, since what a write may add it may also remove.
        tag_ids: The complete set this caller wants on the book.

    Raises:
        TagNotVisibleError: A tag id this caller may not see.
        TagNotEditableError: A global tag, and the caller is not an admin.
    """
    requested = []
    for tag_id in dict.fromkeys(tag_ids):
        tag = visible_tag(session, tag_id, user)
        if tag.owner_id is None and not user.is_admin:
            raise TagNotEditableError
        requested.append(tag)

    replaceable = col(Tag.owner_id) == user.id
    if user.is_admin:
        replaceable = replaceable | col(Tag.owner_id).is_(None)

    replaced_links = session.exec(
        select(BookTag)
        .join(Tag, Tag.id == BookTag.tag_id)
        .where(BookTag.book_id == book.id, replaceable)
    ).all()
    for link in replaced_links:
        session.delete(link)

    for tag in requested:
        session.add(BookTag(book_id=book.id, tag_id=tag.id))
    session.commit()


def book_tag_ids(session: Session, book_id: int, user: User) -> list[int]:
    return list(
        session.exec(
            select(BookTag.tag_id)
            .join(Tag, Tag.id == BookTag.tag_id)
            .where(BookTag.book_id == book_id, _visible_tag_filter(user))
            .order_by(BookTag.tag_id)
        ).all()
    )


def send_to_kindle(
    session: Session,
    book: Book,
    user: User,
    settings: Settings,
    send: Callable[[object, Settings], None],
) -> datetime:
    """Mail `book` to `user`'s Kindle address; returns when it was attempted.

    Args:
        session: Open database session.
        book: The book to send.
        user: Whose Kindle address it goes to.
        settings: SMTP configuration and the attachment ceiling.
        send: Callable that hands the built message to the mail server.

    Returns:
        When the attempt was made — not when it arrived, which is unknowable.

    Raises:
        NoKindleAddressError: The reader has set no address.
        AttachmentTooLargeError: The encoded message is over the ceiling.
        FileNotFoundError: The row points at a file that is not there.
    """
    if not user.kindle_email:
        raise NoKindleAddressError

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
        filename=naming.book_filename(book.title, book.author),
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


# --- notes ----------------------------------------------------------------

# The catalog is shared; marginalia is not. Every function here scopes to the
# caller, and there is no admin override — an admin curating the shared tag
# vocabulary is a librarian, but reading someone's private notes is not the
# same job.


def _note_to_read(note: Note) -> NoteRead:
    return NoteRead(
        id=note.id,
        book_id=note.book_id,
        text=note.text,
        page=note.page,
        created_at=note.created_at,
    )


def _require_book(session: Session, book_id: int) -> Book:
    book = session.get(Book, book_id)
    if book is None:
        raise BookNotFoundError
    return book


def _owned_note(session: Session, note_id: int, user: User) -> Note:
    note = session.get(Note, note_id)
    if note is None or note.user_id != user.id:
        raise NoteNotFoundError
    return note


def _clean_note_text(text: str | None) -> str:
    cleaned = (text or "").strip()
    if not cleaned:
        raise ValueError("Note text must not be empty")
    return cleaned


def list_notes(session: Session, book_id: int, user: User) -> list[NoteRead]:
    """The caller's own notes on one book, newest first.

    Args:
        session: Open database session.
        book_id: Id of the book.
        user: Whose own notes are returned; never anybody else's.

    Raises:
        BookNotFoundError: No such book.
    """
    _require_book(session, book_id)
    notes = session.exec(
        select(Note)
        .where(Note.user_id == user.id, Note.book_id == book_id)
        .order_by(col(Note.created_at).desc(), col(Note.id).desc())
    ).all()
    return [_note_to_read(note) for note in notes]


def create_note(
    session: Session, book_id: int, user: User, text: str, page: int | None
) -> NoteRead:
    _require_book(session, book_id)
    note = Note(user_id=user.id, book_id=book_id, text=_clean_note_text(text), page=page)
    session.add(note)
    session.commit()
    session.refresh(note)
    return _note_to_read(note)


def update_note(session: Session, note_id: int, user: User, fields: dict) -> NoteRead:
    """Apply only the keys the caller actually sent.

    Args:
        session: Open database session.
        note_id: Id of the note.
        user: Must own it.
        fields: Only the keys present are written; an explicit None clears `page`.

    Raises:
        NoteNotFoundError: No such note for this caller.
    """
    note = _owned_note(session, note_id, user)

    if "text" in fields:
        note.text = _clean_note_text(fields["text"])
    if "page" in fields:
        note.page = fields["page"]

    session.add(note)
    session.commit()
    session.refresh(note)
    return _note_to_read(note)


def delete_note(session: Session, note_id: int, user: User) -> None:
    session.delete(_owned_note(session, note_id, user))
    session.commit()


# --- users ----------------------------------------------------------------

# Deleting an account is mostly deleting library rows, which is why it lives
# here rather than in the router: it is a multi-table cascade, and a
# multi-table cascade hidden inside an HTTP handler is how one of the tables
# gets forgotten.


class UserNotFoundError(Exception):
    """No such account."""


class SelfDeletionError(Exception):
    """An admin may not delete their own account."""


def delete_user(session: Session, user_id: int, caller: User) -> None:
    """Remove a reader and everything private to them, in one transaction.

    Args:
        session: Open database session.
        user_id: Who to remove.
        caller: The admin doing it, who may not remove themselves.
    """
    user = session.get(User, user_id)
    if user is None:
        raise UserNotFoundError

    if user.id == caller.id:
        raise SelfDeletionError

    own_tag_ids = [tag.id for tag in session.exec(select(Tag).where(Tag.owner_id == user.id)).all()]
    if own_tag_ids:
        for link in session.exec(select(BookTag).where(col(BookTag.tag_id).in_(own_tag_ids))).all():
            session.delete(link)

    for model, column in (
        (Tag, Tag.owner_id),
        (Note, Note.user_id),
        (UserBookState, UserBookState.user_id),
        (Shelf, Shelf.owner_id),
        (UserSession, UserSession.user_id),
    ):
        for row in session.exec(select(model).where(column == user.id)).all():
            session.delete(row)

    for book in session.exec(select(Book).where(Book.uploaded_by == user.id)).all():
        book.uploaded_by = None
        session.add(book)

    session.delete(user)
    session.commit()
