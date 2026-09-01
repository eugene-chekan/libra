"""Canned librarian replies — Phase 3 swaps this module; the router and client stay the same."""

from collections.abc import Iterator

from sqlmodel import Session, select

from app.models import Book

# Not something a reader would type by accident — exercises the "book not
# indexed" reply, the one shape free-text matching cannot produce honestly.
NOT_INDEXED_TRIGGER = "not-indexed-test"

_NOTHING_FOUND = "I couldn't find anything in your library about that."


def _a_book(session: Session) -> Book | None:
    """The book canned replies point at — first by title, so it's deterministic."""
    return session.exec(select(Book).order_by(Book.title)).first()


def _book_count(session: Session) -> int:
    return len(session.exec(select(Book)).all())


def _split(text: str) -> list[str]:
    """Break a reply into a few word-group pieces, so streaming has more than one to send."""
    words = text.split(" ")
    size = max(1, len(words) // 4)
    return [" ".join(words[i : i + size]) + " " for i in range(0, len(words), size)]


def generate_reply(session: Session, question: str) -> Iterator[dict]:
    """The canned reply to one question, as chunks to stream in order.

    Args:
        session: Open database session, to find a book to cite.
        question: What the reader typed.

    Yields:
        A "tool_status" searching chunk, a "tool_status" done chunk, one or
        more "token" chunks, then a "citation" chunk if the reply names a
        book.
    """
    lowered = question.lower()
    book = _a_book(session)
    count = _book_count(session)

    yield {"type": "tool_status", "status": "searching", "label": "Searching your library…"}
    yield {
        "type": "tool_status",
        "status": "done",
        "summary": f"Searched your library · {count} book{'' if count == 1 else 's'}",
    }

    if NOT_INDEXED_TRIGGER in lowered:
        text = "I don't have that book indexed yet, so I can't answer questions about its contents."
        cite = False
    elif book is None:
        text = _NOTHING_FOUND
        cite = False
    elif "next" in lowered:
        text = f"Based on what's in your library, {book.title} looks like a good next read."
        cite = True
    elif "theme" in lowered:
        text = f"{book.title} explores several themes worth pulling on — ask me about any of them."
        cite = True
    elif "like" in lowered or "similar" in lowered:
        text = f"{book.title} is the closest match in your library to what you described."
        cite = True
    else:
        text = _NOTHING_FOUND
        cite = False

    for piece in _split(text):
        yield {"type": "token", "text": piece}

    if cite:
        yield {"type": "citation", "book_id": book.id, "title": book.title}
