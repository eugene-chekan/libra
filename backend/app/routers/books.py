from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse
from sqlmodel import Session

from app import library, storage
from app.auth import current_user, require_admin
from app.config import Settings, get_settings
from app.db import get_session
from app.epub import InvalidEpubError, read_metadata
from app.logging_config import get_logger
from app.mailer import SendFailedError, SmtpNotConfiguredError, get_mailer
from app.models import (
    SORT_TITLE,
    Book,
    BookCreate,
    BookList,
    BookRead,
    BookSort,
    BookUpdate,
    KindleDeliveryRead,
    User,
    UserBookStateWrite,
)
from app.storage import UploadTooLargeError

router = APIRouter(prefix="/books", tags=["books"])

log = get_logger(__name__)

# The catalog is shared: any member of the household may read it and add to
# it, because uploading is additive and reversible. Editing shared metadata
# and deleting are admin-only — a delete removes the file for everyone.


@router.post("", response_model=BookRead, status_code=201)
def create_book(
    book: BookCreate,
    session: Session = Depends(get_session),
    user: User = Depends(current_user),
) -> BookRead:
    """Add a book from caller-supplied metadata, for CLI and import paths.

    The response is built through the read model rather than by letting
    `response_model` serialize the row: `has_cover` and `tag_ids` are not
    columns on `Book`, so that path drops them silently and the answer
    disagrees with `GET /books/{id}`.
    """
    db_book = Book.model_validate(book)
    session.add(db_book)
    session.commit()
    session.refresh(db_book)
    return library.get_book(session, db_book.id, user)


@router.post("/upload", response_model=BookRead, status_code=201)
def upload_book(
    file: UploadFile,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
    user: User = Depends(current_user),
) -> BookRead:
    """Create a book from an uploaded EPUB, deriving metadata from the file.

    The cover's location is recorded at parse time so serving one never
    re-parses the OPF, and is absent when the file declares none. The file's
    sha256 is kept so Phase 2 can tell whether it has already been ingested
    into the vector store without reading it again.

    A failed insert removes the file: it is committed to the library by then,
    so it has to go back out or become an orphan nothing references. That is
    logged, because the request is about to fail with a 500 whose traceback
    says nothing about a file that was written and removed.

    Ordering matters: we stage the bytes to a temp file, validate and parse
    them, and only then promote the file and insert the row. That way a
    malformed upload never lands in the library, and a failed insert never
    leaves an orphaned file behind.
    """
    original_name = file.filename or "upload.epub"
    if Path(original_name).suffix.lower() != ".epub":
        raise HTTPException(status_code=415, detail="Only .epub files are supported in this phase")

    try:
        staged = storage.stage_upload(file.file, settings.library_dir, settings.max_upload_bytes)
    except UploadTooLargeError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc

    try:
        metadata = read_metadata(staged.path, fallback_title=Path(original_name).stem)
    except InvalidEpubError as exc:
        staged.discard()
        raise HTTPException(status_code=422, detail=f"Invalid EPUB: {exc}") from exc
    except BaseException:
        staged.discard()
        raise

    stored_name = storage.commit(staged, settings.library_dir)

    book = Book(
        title=metadata.title,
        author=metadata.author,
        format="epub",
        file_path=stored_name,
        year=metadata.year,
        blurb=metadata.blurb,
        pages=metadata.pages,
        uploaded_by=user.id,
        book_metadata={
            **metadata.extra,
            "original_filename": original_name,
            "size_bytes": staged.size_bytes,
            **(
                {
                    "cover_href": metadata.cover_href,
                    "cover_media_type": metadata.cover_media_type,
                }
                if metadata.cover_href
                else {}
            ),
            "sha256": staged.sha256,
        },
    )
    try:
        session.add(book)
        session.commit()
    except BaseException:
        session.rollback()
        log.exception("Insert failed after storing %s; removing the orphaned file", stored_name)
        storage.delete(stored_name, settings.library_dir)
        raise
    session.refresh(book)
    return library.get_book(session, book.id, user)


@router.get("", response_model=BookList)
def list_books(
    q: str | None = None,
    tags: str | None = None,
    shelf_id: int | None = None,
    sort: BookSort = SORT_TITLE,
    session: Session = Depends(get_session),
    user: User = Depends(current_user),
) -> BookList:
    """The shared catalog, filtered, each book carrying the caller's own state.

    A tag or shelf the caller cannot see is a 404 rather than an empty result:
    an empty list would confirm it exists, which is enough to enumerate
    another reader's private vocabulary by walking ids.

    `tags` is a comma-separated list of ids. Tag filters **OR** each other — a
    book matches if it carries any one of them — and `q` **ANDs** against that
    result, matching case-insensitively on title or author. Those semantics
    come from the UI design; the client merges its sidebar selection and any
    `#tag` tokens into the single list this takes.
    """
    try:
        tag_ids = _parse_ids(tags)
    except ValueError as exc:
        raise HTTPException(
            status_code=422, detail="tags must be a comma-separated id list"
        ) from exc

    try:
        items, total = library.search_books(
            session, user, query=q, tag_ids=tag_ids, shelf_id=shelf_id, sort=sort
        )
    except library.TagNotVisibleError as exc:
        raise HTTPException(status_code=404, detail="Tag not found") from exc
    except library.ShelfNotVisibleError as exc:
        raise HTTPException(status_code=404, detail="Shelf not found") from exc

    return BookList(items=items, total=total)


def _parse_ids(raw: str | None) -> list[int]:
    if not raw or not raw.strip():
        return []
    return [int(part) for part in raw.split(",") if part.strip()]


@router.get("/{book_id}", response_model=BookRead)
def get_book(
    book_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(current_user),
) -> BookRead:
    view = library.get_book(session, book_id, user)
    if view is None:
        raise HTTPException(status_code=404, detail="Book not found")
    return view


@router.get("/{book_id}/cover")
def get_cover(
    book_id: int,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
    _: User = Depends(current_user),
) -> Response:
    """The book's cover image, read straight out of the EPUB.

    `nosniff` because the media type is allowlisted and a browser must not
    decide for itself that the allowlist was wrong. `private` because every
    response here required a session, so a shared cache must never hand one
    household member's request to another.

    `404` when the file declares no cover, when the image is missing from the
    archive, or when the declared media type is not an image. A caller cannot
    act on the difference — there is nothing to show either way — and the
    last case is server-side detail, not something to explain to a browser.
    """
    book = session.get(Book, book_id)
    if book is None:
        raise HTTPException(status_code=404, detail="Book not found")

    try:
        data, media_type, etag = library.cover_for(session, book, settings)
    except library.NoCoverError as exc:
        raise HTTPException(status_code=404, detail="This book has no cover") from exc

    return Response(
        content=data,
        media_type=media_type,
        headers={
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, max-age=86400",
            "ETag": etag,
        },
    )


@router.get("/{book_id}/file")
def download_book(
    book_id: int,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
    _: User = Depends(current_user),
) -> FileResponse:
    """The stored EPUB itself, as an attachment.

    A missing file is logged and answered 500: the row outlived its file — an
    unmounted volume, or a file removed by hand — which means the installation
    is inconsistent, not that the caller did anything wrong. A stored path that
    escapes the library is only reachable through `POST /books` and its
    caller-supplied `file_path`; reaching that branch means `storage.resolve()`
    did its job.

    The headers are `nosniff` and `private` for the same reasons the cover's
    are, and more sharply: these bytes are a user-uploaded file served from an
    origin that carries a session cookie.

    There is no in-browser reader in any phase — the Kindle, or whatever the
    reader already uses, is the reader — so the design's "Start Reading"
    button downloads. Nothing else served book content before this.

    The catalog is shared, so any signed-in reader may download any book;
    there is nothing to scope. What matters here is the filename, which is
    rebuilt from the catalog rather than echoed from the uploader's own.
    """
    book = session.get(Book, book_id)
    if book is None:
        raise HTTPException(status_code=404, detail="Book not found")

    try:
        path, filename = library.file_for(session, book, settings)
    except library.BookFileMissingError as exc:
        log.warning("book %s has no file at %s", book_id, book.file_path)
        raise HTTPException(status_code=404, detail="This book's file is missing") from exc
    except ValueError as exc:
        log.warning("book %s has a file_path outside the library", book_id)
        raise HTTPException(status_code=404, detail="This book's file is missing") from exc

    return FileResponse(
        path,
        media_type="application/epub+zip",
        filename=filename,
        headers={
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, max-age=86400",
        },
    )


@router.put("/{book_id}/state", response_model=BookRead)
def set_reading_state(
    book_id: int,
    state: UserBookStateWrite,
    session: Session = Depends(get_session),
    user: User = Depends(current_user),
) -> BookRead:
    """Set the caller's own rating and progress for a book.

    Always permitted — this touches nobody else's view. Separate from
    `PATCH /books/{id}`, which edits the shared catalog and is admin-only:
    an endpoint whose authorization depended on which keys the body happened
    to contain would be difficult to test exhaustively and worse to reason
    about.

    PUT rather than PATCH because the row is small enough that a full
    representation is honest, and the designed edit form commits every field
    at once anyway.

    `tag_ids` replaces the tags this caller may set — see `library.set_book_tags`
    for which those are. An omitted `shelf_id` leaves the placement alone and
    an explicit null clears it, which is what `exclude_unset` distinguishes.
    """
    book = session.get(Book, book_id)
    if book is None:
        raise HTTPException(status_code=404, detail="Book not found")

    fields = state.model_dump(exclude_unset=True)
    try:
        if "tag_ids" in fields:
            library.set_book_tags(session, book, user, state.tag_ids or [])

        return library.set_reading_state(
            session,
            book,
            user,
            rating=state.rating,
            progress=state.progress,
            shelf_id=state.shelf_id,
            set_shelf="shelf_id" in fields,
        )
    except library.ShelfNotVisibleError as exc:
        raise HTTPException(status_code=404, detail="Shelf not found") from exc
    except library.ShelfNotOwnedError as exc:
        raise HTTPException(
            status_code=403, detail="You can only place books on your own shelves"
        ) from exc
    except library.TagNotVisibleError as exc:
        raise HTTPException(status_code=404, detail="Tag not found") from exc
    except library.TagNotEditableError as exc:
        raise HTTPException(
            status_code=403, detail="Only an admin can put a global tag on a book"
        ) from exc


@router.post("/{book_id}/send-to-kindle", status_code=202, response_model=KindleDeliveryRead)
def send_to_kindle(
    book_id: int,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
    user: User = Depends(current_user),
    send=Depends(get_mailer),
) -> KindleDeliveryRead:
    """Mail a book to the caller's own Kindle address.

    No request body: the destination is the caller's stored address and
    cannot be overridden per request. An endpoint that mails an arbitrary
    file to an arbitrary address is an open relay wearing a library's
    clothes, and the feature gains nothing from allowing it.

    `202`, not `200`. Amazon silently discards mail from a sender the
    recipient has not approved — no bounce, no status API — so handing the
    message to the mail server is the last thing this process can observe.
    Claiming delivery would be claiming more than we know.

    A missing file is a 500, not a 4xx: a row pointing at nothing on disk is
    an integrity bug rather than something the caller did. A send failure
    reports `str(exc)`, which is written to be safe to show — the mail
    server's own response text stays in the log, because it quotes the
    username.
    """
    if not settings.kindle_delivery_configured:
        raise HTTPException(
            status_code=503, detail="Kindle delivery is not configured on this server"
        )

    book = session.get(Book, book_id)
    if book is None:
        raise HTTPException(status_code=404, detail="Book not found")

    try:
        attempted_at = library.send_to_kindle(session, book, user, settings, send)
    except library.NoKindleAddressError as exc:
        raise HTTPException(
            status_code=422, detail="Set your Kindle address before sending"
        ) from exc
    except library.AttachmentTooLargeError as exc:
        raise HTTPException(
            status_code=413,
            detail=f"This book is too large to email; the limit is {exc.limit_bytes} bytes",
        ) from exc
    except FileNotFoundError as exc:
        log.error("Book %s references a missing file: %s", book_id, book.file_path)
        raise HTTPException(status_code=500, detail="The stored file is missing") from exc
    except SmtpNotConfiguredError as exc:
        raise HTTPException(
            status_code=503, detail="Kindle delivery is not configured on this server"
        ) from exc
    except SendFailedError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return KindleDeliveryRead(book_id=book_id, sent_to=user.kindle_email, attempted_at=attempted_at)


@router.patch("/{book_id}", response_model=BookRead)
def update_book(
    book_id: int,
    update: BookUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(require_admin),
) -> BookRead:
    """Correct a book's metadata, e.g. after an imperfect parse on upload.

    Admin only: title and author describe the shared catalog, so one
    person's correction changes what everyone sees.

    `exclude_unset` keeps an omitted field distinct from one explicitly sent,
    which is what makes this a PATCH rather than a partial overwrite.

    The response goes through the read model, for the reason `POST /books`
    does: `rating`, `progress`, `has_cover`, `shelf_id` and `tag_ids` are not
    columns on `Book`, so returning the row lets `response_model` fill them
    with defaults. This endpoint did exactly that until #65, and answered
    "rating 0, progress 0" for a book the caller had rated and half read —
    well-formed, and untrue.
    """
    book = session.get(Book, book_id)
    if book is None:
        raise HTTPException(status_code=404, detail="Book not found")

    for key, value in update.model_dump(exclude_unset=True).items():
        setattr(book, key, value)

    session.add(book)
    session.commit()
    session.refresh(book)
    return library.get_book(session, book_id, user)


@router.delete("/{book_id}", status_code=204)
def delete_book(
    book_id: int,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
    _: User = Depends(require_admin),
) -> None:
    """Remove a book and its file, in that order.

    The file goes after the row, so a failed unlink cannot leave a book that is
    listed but unreadable. A leftover file is the safer of the two states.

    Admin only. Uploading is additive and reversible; deleting destroys a
    file the whole household shares, and later a row every user has reading
    state against.
    """
    book = session.get(Book, book_id)
    if book is None:
        raise HTTPException(status_code=404, detail="Book not found")

    file_path = book.file_path
    session.delete(book)
    session.commit()
    storage.delete(file_path, settings.library_dir)
