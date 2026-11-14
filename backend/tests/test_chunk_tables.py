"""The chunk tables: the full-text index that follows them, and cleaning up after a book."""

from pathlib import Path

import pytest
from sqlalchemy import text
from sqlmodel import Session, select

from app import library
from app.config import Settings
from app.models import Book, Chunk, ChunkVector
from tests.epub_factory import build_epub


def matching(session: Session, query: str) -> list[int]:
    """The ids of the chunks the full-text index finds for an FTS5 query."""
    sql = text("SELECT rowid FROM chunk_fts WHERE chunk_fts MATCH :query ORDER BY rowid")
    return list(session.connection().execute(sql, {"query": query}).scalars())


def add_book(session: Session, settings: Settings, folder: Path, name: str) -> Book:
    path = build_epub(folder / name, titles=[name])
    with path.open("rb") as source:
        return library.add_book_from_file(session, source, name, settings, uploaded_by=None)


def add_chunk(session: Session, book_id: int, position: int, words: str) -> Chunk:
    chunk = Chunk(
        book_id=book_id,
        position=position,
        spine_index=0,
        chapter_title=None,
        text=words,
        word_count=len(words.split()),
        token_count=len(words.split()),
        chunker_version=1,
    )
    session.add(chunk)
    session.commit()
    session.refresh(chunk)
    return chunk


@pytest.fixture(name="book")
def book_fixture(session: Session, settings: Settings, tmp_path: Path) -> Book:
    return add_book(session, settings, tmp_path, "dune.epub")


def test_create_all_builds_the_full_text_index(session: Session, book: Book) -> None:
    chunk = add_chunk(session, book.id, 0, "The ships were running")

    assert matching(session, '"ship"') == [chunk.id]
    assert matching(session, '"run"') == [chunk.id]


def test_deleting_a_chunk_removes_it_from_the_index(session: Session, book: Book) -> None:
    chunk = add_chunk(session, book.id, 0, "The ships were running")

    session.delete(chunk)
    session.commit()

    assert matching(session, '"ship"') == []


def test_changing_a_chunk_text_changes_the_index(session: Session, book: Book) -> None:
    chunk = add_chunk(session, book.id, 0, "The ships were running")

    chunk.text = "A quiet harbour"
    session.add(chunk)
    session.commit()

    assert matching(session, '"ship"') == []
    assert matching(session, '"harbour"') == [chunk.id]


def test_deleting_a_book_removes_its_chunks_vectors_and_index_rows(
    session: Session, settings: Settings, tmp_path: Path
) -> None:
    old = add_book(session, settings, tmp_path, "dune.epub")
    old_id = old.id
    for position, words in enumerate(["The ships were running", "A quiet harbour"]):
        chunk = add_chunk(session, old_id, position, words)
        session.add(ChunkVector(chunk_id=chunk.id, model="m", vector=b"\0" * 8))
    session.commit()

    library.delete_book(session, old_id, settings)
    new = add_book(session, settings, tmp_path, "emma.epub")

    assert new.id == old_id
    assert session.exec(select(Chunk).where(Chunk.book_id == new.id)).all() == []
    assert session.exec(select(ChunkVector)).all() == []
    assert matching(session, '"ship" OR "harbour"') == []


def test_deleting_a_book_leaves_other_books_alone(
    session: Session, settings: Settings, tmp_path: Path
) -> None:
    gone = add_book(session, settings, tmp_path, "dune.epub")
    kept = add_book(session, settings, tmp_path, "emma.epub")
    add_chunk(session, gone.id, 0, "The ships were running")
    chunk = add_chunk(session, kept.id, 0, "A quiet harbour")
    session.add(ChunkVector(chunk_id=chunk.id, model="m", vector=bytes(8)))
    session.commit()

    library.delete_book(session, gone.id, settings)

    assert [c.id for c in session.exec(select(Chunk)).all()] == [chunk.id]
    assert [v.chunk_id for v in session.exec(select(ChunkVector)).all()] == [chunk.id]
    assert matching(session, '"harbour"') == [chunk.id]
