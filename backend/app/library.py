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


class TagNotVisibleError(Exception):
    """No such tag, or one belonging to another reader.

    Deliberately indistinguishable, for the same reason as shelves: telling
    them apart lets a caller enumerate someone else's private vocabulary by
    walking ids.
    """


class TagNotEditableError(Exception):
    """A global tag, and the caller is not an admin."""


class DuplicateTagNameError(Exception):
    """That name is already taken in the scope being written to."""


class ShadowsGlobalTagError(Exception):
    """A personal tag may not take the name of a global one.

    Two rows both rendering as "Sci-Fi" in one sidebar is a bug from the
    reader's side however defensible it is in the schema.
    """


class BookNotFoundError(Exception):
    """No such book.

    Unlike shelves and tags there is nothing to conceal — the catalog is
    shared, so every reader already knows which books exist and existence is
    the only question a lookup can answer.
    """


class NoteNotFoundError(Exception):
    """No such note, or one belonging to another reader.

    One error for both, as with shelves and tags. A reader's marginalia is
    private even though the book it hangs off is not, so distinguishing the
    cases would let a caller confirm someone else's notes exist by walking
    ids.
    """


class BookFileMissingError(Exception):
    """The row is there but the file it points at is not.

    Distinct from `BookNotFoundError`: one is a bad id, the other is a library
    that has drifted from its database — a volume unmounted, a file removed by
    hand. Worth telling apart in a log even though a caller sees the same 404,
    because only one of them means something is wrong with the installation.
    """


class NoCoverError(Exception):
    """This book has no usable cover.

    Covers a file that declares none, one whose image is missing from the
    archive, and one whose declared media type is not an image. All three are
    the same thing to a caller — there is nothing to show — and the last is
    deliberately not distinguished, since "this book's cover is the wrong
    type" is server-side detail.
    """


class AttachmentTooLargeError(Exception):
    """The encoded message would exceed what Send to Kindle accepts."""

    def __init__(self, limit_bytes: int) -> None:
        super().__init__(f"exceeds the {limit_bytes} byte attachment limit")
        self.limit_bytes = limit_bytes


def _merge(book: Book, state: UserBookState | None, tag_ids: list[int] | None = None) -> BookRead:
    """Combine a shared catalog row with one reader's state.

    A missing state row is not an error — rows are created lazily, so most
    books have none for most users, and the defaults on `BookRead` are the
    correct answer for "never touched this book".

    `has_cover` is derived from what the parse recorded, which costs no extra
    query and cannot disagree with what the cover endpoint would serve.
    """
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
    """One book as `user` sees it, or None if there is no such book."""
    book = session.get(Book, book_id)
    if book is None:
        return None
    return _merge(
        book,
        session.get(UserBookState, (user.id, book_id)),
        book_tag_ids(session, book_id, user),
    )


def list_books(session: Session, user: User) -> list[BookRead]:
    """Every book, each carrying `user`'s own state. Unfiltered `search_books`."""
    items, _ = search_books(session, user)
    return items


def cover_for(session: Session, book: Book, settings: Settings) -> tuple[bytes, str, str]:
    """A book's cover image, its media type, and an ETag.

    Read from the archive on demand rather than extracted to disk at upload:
    that keeps exactly one file per book on disk, so `DELETE /books/{id}` has
    one artifact to clean up rather than two.

    The bytes come from a file a user uploaded and are served from the API's
    own origin — which now carries a session cookie — so the media type is
    checked against an allowlist rather than trusted. A book archive that
    declares its "cover" as text/html would otherwise be stored XSS with a
    session to steal.
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

    Returns a path rather than bytes, unlike `cover_for`: a cover is a handful
    of kilobytes and gets an ETag computed from it, while a book is megabytes
    and should stream off disk rather than through memory.

    The offered filename is rebuilt from the catalog by `naming.book_filename`
    and never taken from `book_metadata["original_filename"]`, which is the
    string the uploader supplied and so exactly what should not be echoed into
    a response header.
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
    """Find books, as `user` sees them. Returns the matches and their count.

    This is Phase 3's `search_library`. It lives here rather than in the route
    handler precisely so the agent and the REST API share one implementation
    of the scoping rules — two copies would be two chances to disagree about
    what a reader is allowed to see.

    Semantics come straight from the UI design and are not negotiable
    downstream: **tag filters OR each other** (a book matches if it carries
    any one of them), and **the text query ANDs against that result**, matching
    case-insensitively against title or author.

    **Visibility is checked before filtering, never after.** Filtering by a tag
    the caller cannot see raises rather than returning an empty list: an empty
    result would confirm the tag exists, and let someone enumerate another
    reader's private vocabulary by walking ids. A shelf works the same way, so
    a private one cannot be probed through this endpoint either.

    The tag subquery below carries no visibility filter of its own, on purpose.
    The loop above has already rejected every id the caller cannot see, so
    repeating the check would change no behaviour and no test could tell it
    from its absence — security code nothing can distinguish from nothing is
    worse than none, because it reads as protection.

    The count is exact because nothing is paginated yet. Pagination would make
    it a separate COUNT, which is why the response is an envelope now rather
    than a bare list every client would later have to re-learn. `added` sorts
    by primary key: there is no `created_at` on `Book`, and for an append-only
    catalog insertion order is the same thing. The default sort is NOCASE, so
    "a book" and "A Book" sort together instead of in two ASCII blocks.
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
    alone) from an explicit null (take the book off its shelf). The shelf must
    belong to `user`, which is the rule no foreign key expresses: the column's
    FK would accept somebody else's id, and with SQLite's foreign keys off by
    default it would accept a nonexistent one too.

    `started_at` is set once, on the first evidence of reading, and never
    cleared — a re-read does not change when this reader first opened the book.
    `finished_at` is the other way about: re-finishing does not move it, and
    dropping back below 1 clears it, because "finished at some point" is not
    what any view means by finished.

    The response is built **with** the tag ids. `_merge` defaults them to
    empty, so leaving the argument out made every answer report a book with no
    tags — including the request that had just set some. `PATCH /books/{id}`
    carried the same omission, fixed in #65.
    """
    state = session.get(UserBookState, (user.id, book.id))
    if state is None:
        state = UserBookState(user_id=user.id, book_id=book.id)

    if set_shelf:
        if shelf_id is not None:
            owned_shelf(session, shelf_id, user)
        state.shelf_id = shelf_id

    now = utcnow()

    if progress > 0 and state.started_at is None:
        state.started_at = now

    if progress >= 1:
        if state.finished_at is None:
            state.finished_at = now
    else:
        state.finished_at = None

    state.rating = rating
    state.progress = progress
    state.updated_at = now

    session.add(state)
    session.commit()
    session.refresh(state)
    return _merge(book, state, book_tag_ids(session, book.id, user))


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
    """The caller's own shelves in their chosen order, then others' public ones."""
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
    somewhere they did not ask for. Reassignment and deletion land together or
    not at all.
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
    """Reject a clash before the database does, and refuse to shadow a global.

    A personal tag sharing a global tag's name would render as two identical
    rows in one sidebar, so it is rejected even though the indexes permit it.
    """
    global_match = session.exec(select(Tag).where(Tag.owner_id.is_(None), Tag.name == name)).first()
    if global_match is not None and global_match.id != exclude_id:
        raise ShadowsGlobalTagError if not is_global else DuplicateTagNameError

    if not is_global:
        own = session.exec(select(Tag).where(Tag.owner_id == user.id, Tag.name == name)).first()
        if own is not None and own.id != exclude_id:
            raise DuplicateTagNameError


def clean_tag_name(name: str) -> str:
    """Strip a tag name, and refuse one with whitespace inside it.

    The search box reads `#tag` tokens and splits on whitespace, so a tag
    named "lent out" could be created but never searched for: the parser sees
    `#lent`, which matches nothing, and a stray word "out". Keeping the name a
    single token is what makes the tag reachable. A hyphen reads the same and
    survives the split.
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
    """Rename a tag. Moves nothing: books reference it by id."""
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

    There is no foreign-key cascade to rely on: SQLite has enforcement off by
    default, so the link rows are deleted explicitly. Leaving them would
    strand `book_tag` rows pointing at a tag that no longer exists.
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

    For a reader that means their own personal tags. A global tag describes
    the book for the whole household and is not theirs to hang on it, so a
    reader who lists a global id is asking for something they cannot grant and
    is told so.

    **An admin may set global tags here too**, which is what curating a shared
    vocabulary actually requires. Until this, no caller could put a global tag
    on a book at all: the refusal named an admin as the person who does it
    ("managed by an admin, not per book") while refusing admins as well, and
    no other endpoint assigned tags. A global tag could be created and then
    never used.

    **What a write replaces has to match what it may add.** This is a PUT, so a
    tag left out of the list is meant to come off; if an admin could add a
    global tag while only their personal links were cleared, a global tag would
    go onto a book and never come off it again. Another reader's personal tags
    are never in scope either way — they are not this caller's to remove.
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

    Raises when the book is missing rather than returning an empty list, which
    is where this differs from `get_book` returning `None`. An empty list is
    already a valid answer here — a book nobody has annotated — so the two
    cases have to be distinguishable or a typo in a book id reads as "no notes
    yet".

    Id breaks ties in the ordering: notes made in the same request share a
    timestamp, and an unstable order would make the list jump between reloads.
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

    Takes a dict rather than a `NoteUpdate` because the distinction that
    matters — `page: null` to clear it versus `page` omitted to leave it —
    survives `model_dump(exclude_unset=True)` and not the model itself.
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

    Books survive with `uploaded_by` nulled: a shared catalog should not lose
    volumes because a household member left. Their public shelves do vanish
    for everyone else, which is the visible consequence and is accepted.

    Every dependent row is deleted by hand. SQLite has foreign-key enforcement
    off by default, so there is no database cascade to lean on — the same
    reason `delete_tag` removes its own link rows.

    **There is deliberately no last-admin check.** It would be unreachable:
    the endpoint is admin-only and self-deletion raises below, so the caller
    is an administrator who is not the target and therefore survives. A guard
    no test can distinguish from its absence reads as protection while
    providing none, which is worse than not having it.
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
