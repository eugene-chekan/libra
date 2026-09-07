from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlmodel import Session

from app import covers, library, storage
from app.auth import current_user, require_admin
from app.config import Settings, get_settings
from app.covers_from_url import FetchFailedError, TooLargeError, UnsafeUrlError
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
    """Add a book from caller-supplied metadata, for CLI and import paths."""
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
    """Create a book from an uploaded EPUB, deriving metadata from the file."""
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
    """The shared catalog, filtered, each book carrying the caller's own state."""
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
    """The book's cover image: the custom one if the book has one, else the EPUB's."""
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


class CoverUrl(BaseModel):
    """Where to fetch a cover from."""

    url: str


@router.put("/{book_id}/cover")
def set_cover(
    book_id: int,
    file: UploadFile,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
    user: User = Depends(require_admin),
) -> BookRead:
    """Replace a book's cover with an uploaded picture."""
    try:
        return library.set_cover(session, book_id, file.file, user, settings)
    except library.BookNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Book not found") from exc
    except covers.NotAnImageError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    except UploadTooLargeError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc


@router.post("/{book_id}/cover/from-url")
def set_cover_from_url(
    book_id: int,
    body: CoverUrl,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
    user: User = Depends(require_admin),
) -> BookRead:
    """Replace a book's cover with a picture fetched from a link."""
    try:
        return library.set_cover_from_url(session, book_id, body.url, user, settings)
    except library.BookNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Book not found") from exc
    # The fetched bytes still go through covers.store, so the same two failures
    # the upload route maps are possible here. Mapped identically.
    except covers.NotAnImageError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    except UploadTooLargeError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    # Before FetchFailedError, which it inherits from: caught the other way
    # round this answers 422 where 413 is meant.
    except TooLargeError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    except (UnsafeUrlError, FetchFailedError) as exc:
        # The module's own sentence, which names what was wrong with the
        # address. A generic message here leaves the admin guessing.
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/{book_id}/cover")
def clear_cover(
    book_id: int,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
    user: User = Depends(require_admin),
) -> BookRead:
    """Drop the custom cover, so the book's own one comes back."""
    try:
        return library.clear_cover(session, book_id, user, settings)
    except library.BookNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Book not found") from exc


@router.get("/{book_id}/file")
def download_book(
    book_id: int,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
    _: User = Depends(current_user),
) -> FileResponse:
    """The stored EPUB itself, as an attachment."""
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
    """Set the caller's own rating and progress for a book."""
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
            rating=state.rating if "rating" in fields else None,
            progress=state.progress if "progress" in fields else None,
            position=state.position if "position" in fields else None,
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
    """Mail a book to the caller's own Kindle address."""
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
    """Correct a book's metadata, e.g."""
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
    """Remove a book, its file, and everything readers had on it."""
    try:
        library.delete_book(session, book_id, settings)
    except library.BookNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Book not found") from exc
