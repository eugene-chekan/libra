"""The canned librarian — Phase 3 swaps this module; the router and the
client that call it do not change.
"""

from sqlmodel import Session

from app.librarian import NOT_INDEXED_TRIGGER, generate_reply
from app.models import Book


def _add_book(session: Session, title: str = "Dune") -> Book:
    book = Book(title=title, author="Frank Herbert", format="epub", file_path=f"{title}.epub")
    session.add(book)
    session.commit()
    session.refresh(book)
    return book


def _drain(session: Session, question: str) -> list[dict]:
    return list(generate_reply(session, question))


def test_opens_with_a_tool_status_pair(session: Session) -> None:
    _add_book(session)
    chunks = _drain(session, "What should I read next?")

    assert chunks[0] == {
        "type": "tool_status",
        "status": "searching",
        "label": "Searching your library…",
    }
    assert chunks[1] == {
        "type": "tool_status",
        "status": "done",
        "summary": "Searched your library · 1 book",
    }


def test_recommends_the_one_book_in_the_library_for_what_to_read_next(session: Session) -> None:
    book = _add_book(session, "Dune")

    chunks = _drain(session, "What should I read next?")

    text = "".join(c["text"] for c in chunks if c["type"] == "token")
    assert "Dune" in text
    citation = next(c for c in chunks if c["type"] == "citation")
    assert citation == {"type": "citation", "book_id": book.id, "title": "Dune"}


def test_picks_the_first_book_by_title_when_several_exist(session: Session) -> None:
    _add_book(session, "Neuromancer")
    first = _add_book(session, "Dune")

    chunks = _drain(session, "next?")

    citation = next(c for c in chunks if c["type"] == "citation")
    assert citation["book_id"] == first.id
    done = next(c for c in chunks if c["type"] == "tool_status" and c["status"] == "done")
    assert done["summary"] == "Searched your library · 2 books"


def test_answers_a_themes_question_citing_the_book(session: Session) -> None:
    book = _add_book(session, "Dune")

    chunks = _drain(session, "What are the main themes in Dune?")

    citation = next(c for c in chunks if c["type"] == "citation")
    assert citation["book_id"] == book.id


def test_answers_a_similarity_question_citing_the_book(session: Session) -> None:
    book = _add_book(session, "Dune")

    chunks = _drain(session, "Find me something like Dune.")

    citation = next(c for c in chunks if c["type"] == "citation")
    assert citation["book_id"] == book.id


def test_an_empty_library_gets_the_nothing_found_reply_with_no_citation(session: Session) -> None:
    chunks = _drain(session, "What should I read next?")

    text = "".join(c["text"] for c in chunks if c["type"] == "token")
    assert text.strip() == "I couldn't find anything in your library about that."
    assert not any(c["type"] == "citation" for c in chunks)


def test_an_unmatched_question_gets_the_nothing_found_reply(session: Session) -> None:
    _add_book(session)

    chunks = _drain(session, "What's the capital of France?")

    text = "".join(c["text"] for c in chunks if c["type"] == "token")
    assert text.strip() == "I couldn't find anything in your library about that."
    assert not any(c["type"] == "citation" for c in chunks)


def test_the_not_indexed_trigger_names_no_citation(session: Session) -> None:
    _add_book(session)

    chunks = _drain(session, f"Tell me about {NOT_INDEXED_TRIGGER}")

    text = "".join(c["text"] for c in chunks if c["type"] == "token")
    assert "indexed" in text
    assert not any(c["type"] == "citation" for c in chunks)
