from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.db import get_session
from app.models import Book, BookCreate, BookRead

router = APIRouter(prefix="/books", tags=["books"])


@router.post("", response_model=BookRead, status_code=201)
def create_book(book: BookCreate, session: Session = Depends(get_session)) -> Book:
    db_book = Book.model_validate(book)
    session.add(db_book)
    session.commit()
    session.refresh(db_book)
    return db_book


@router.get("", response_model=list[BookRead])
def list_books(session: Session = Depends(get_session)) -> list[Book]:
    return list(session.exec(select(Book)).all())


@router.get("/{book_id}", response_model=BookRead)
def get_book(book_id: int, session: Session = Depends(get_session)) -> Book:
    book = session.get(Book, book_id)
    if book is None:
        raise HTTPException(status_code=404, detail="Book not found")
    return book


@router.delete("/{book_id}", status_code=204)
def delete_book(book_id: int, session: Session = Depends(get_session)) -> None:
    book = session.get(Book, book_id)
    if book is None:
        raise HTTPException(status_code=404, detail="Book not found")
    session.delete(book)
    session.commit()
