from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlmodel import Session

from app import library, storage
from app.auth import current_user, require_admin
from app.config import Settings, get_settings
from app.db import get_session
from app.epub import InvalidEpubError, read_metadata
from app.logging_config import get_logger
from app.mailer import SendFailedError, SmtpNotConfiguredError, get_mailer
from app.models import (
    Book,
    BookCreate,
    BookRead,
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
    _: User = Depends(current_user),
) -> Book:
    db_book = Book.model_validate(book)
    session.add(db_book)
    session.commit()
    session.refresh(db_book)
    return db_book


@router.post("/upload", response_model=BookRead, status_code=201)
def upload_book(
    file: UploadFile,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
    user: User = Depends(current_user),
) -> Book:
    """Create a book from an uploaded EPUB, deriving metadata from the file.

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
            # Kept so Phase 2 can tell whether a file has already been
            # ingested into the vector store without re-reading it.
            "sha256": staged.sha256,
        },
    )
    try:
        session.add(book)
        session.commit()
    except BaseException:
        session.rollback()
        # The file is already committed to the library at this point, so it
        # has to go back out or it is an orphan nothing references. Logged
        # because the request is about to fail with a 500 whose traceback
        # says nothing about the file that was written and removed.
        log.exception("Insert failed after storing %s; removing the orphaned file", stored_name)
        storage.delete(stored_name, settings.library_dir)
        raise
    session.refresh(book)
    return book


@router.get("", response_model=list[BookRead])
def list_books(
    session: Session = Depends(get_session),
    user: User = Depends(current_user),
) -> list[BookRead]:
    """The shared catalog, each book carrying the caller's own reading state."""
    return library.list_books(session, user)


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
    """
    book = session.get(Book, book_id)
    if book is None:
        raise HTTPException(status_code=404, detail="Book not found")

    return library.set_reading_state(
        session, book, user, rating=state.rating, progress=state.progress
    )


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
        # A row pointing at a file that is not on disk is an integrity bug,
        # not something the caller did wrong.
        log.error("Book %s references a missing file: %s", book_id, book.file_path)
        raise HTTPException(status_code=500, detail="The stored file is missing") from exc
    except SmtpNotConfiguredError as exc:
        raise HTTPException(
            status_code=503, detail="Kindle delivery is not configured on this server"
        ) from exc
    except SendFailedError as exc:
        # str(exc) is written to be safe to show; the SMTP server's own
        # response text stays in the log, because it quotes the username.
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return KindleDeliveryRead(book_id=book_id, sent_to=user.kindle_email, attempted_at=attempted_at)


@router.patch("/{book_id}", response_model=BookRead)
def update_book(
    book_id: int,
    update: BookUpdate,
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
) -> Book:
    """Correct a book's metadata, e.g. after an imperfect parse on upload.

    Admin only: title and author describe the shared catalog, so one
    person's correction changes what everyone sees.
    """
    book = session.get(Book, book_id)
    if book is None:
        raise HTTPException(status_code=404, detail="Book not found")

    # exclude_unset keeps an omitted field distinct from one explicitly sent,
    # which is what makes this a PATCH rather than a partial overwrite.
    for key, value in update.model_dump(exclude_unset=True).items():
        setattr(book, key, value)

    session.add(book)
    session.commit()
    session.refresh(book)
    return book


@router.delete("/{book_id}", status_code=204)
def delete_book(
    book_id: int,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
    _: User = Depends(require_admin),
) -> None:
    """Remove a book and its file.

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
    # After the row is gone, so a failed unlink can't leave a book that is
    # listed but unreadable. A leftover file is the safer of the two states.
    storage.delete(file_path, settings.library_dir)
