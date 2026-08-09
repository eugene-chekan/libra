from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app import library
from app.auth import current_user
from app.db import get_session
from app.models import NoteCreate, NoteRead, NoteUpdate, User

# No prefix: notes are addressed under their book when the book is the thing
# you have (listing, creating) and by their own id when the note is (editing,
# deleting). One router either way, so the scoping rules stay in one file.
router = APIRouter(tags=["notes"])

# Another reader's note is a 404, never a 403. The catalog is shared, so a
# book's existence is public — but "you may not touch this note" would
# confirm the note exists, which is the part that is not.


@router.get("/books/{book_id}/notes", response_model=list[NoteRead])
def list_notes(
    book_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(current_user),
) -> list[NoteRead]:
    """The caller's own notes on this book, newest first."""
    try:
        return library.list_notes(session, book_id, user)
    except library.BookNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Book not found") from exc


@router.post("/books/{book_id}/notes", response_model=NoteRead, status_code=201)
def create_note(
    book_id: int,
    note: NoteCreate,
    session: Session = Depends(get_session),
    user: User = Depends(current_user),
) -> NoteRead:
    try:
        return library.create_note(session, book_id, user, note.text, note.page)
    except library.BookNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Book not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.patch("/notes/{note_id}", response_model=NoteRead)
def update_note(
    note_id: int,
    update: NoteUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(current_user),
) -> NoteRead:
    """Edit a note. Omitted fields are left alone; an explicit `page: null`
    clears the page, which is why this passes `exclude_unset` down rather
    than the model."""
    fields = update.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=422, detail="Nothing to update")
    try:
        return library.update_note(session, note_id, user, fields)
    except library.NoteNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Note not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/notes/{note_id}", status_code=204)
def delete_note(
    note_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(current_user),
) -> None:
    try:
        library.delete_note(session, note_id, user)
    except library.NoteNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Note not found") from exc
