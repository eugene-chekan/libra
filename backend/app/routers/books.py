from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlmodel import Session, select

from app import storage
from app.auth import current_user, require_admin
from app.config import Settings, get_settings
from app.db import get_session
from app.epub import InvalidEpubError, read_metadata
from app.models import Book, BookCreate, BookRead, BookUpdate, User
from app.storage import UploadTooLargeError

router = APIRouter(prefix="/books", tags=["books"])

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
    _: User = Depends(current_user),
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
        storage.delete(stored_name, settings.library_dir)
        raise
    session.refresh(book)
    return book


@router.get("", response_model=list[BookRead])
def list_books(
    session: Session = Depends(get_session),
    _: User = Depends(current_user),
) -> list[Book]:
    return list(session.exec(select(Book)).all())


@router.get("/{book_id}", response_model=BookRead)
def get_book(
    book_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(current_user),
) -> Book:
    book = session.get(Book, book_id)
    if book is None:
        raise HTTPException(status_code=404, detail="Book not found")
    return book


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
