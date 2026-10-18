"""Storing the test books' chunks and their vectors, for search."""

from collections.abc import Callable

from sqlalchemy import func
from sqlmodel import Session, col, select

from app import storage
from app.config import Settings
from app.models import Book, Chunk, ChunkVector
from rag.chunking import CHUNKER_VERSION, TextChunk
from rag.corpus import CorpusBook, CorpusError, frozen_chunks
from rag.embeddings import Embedder, embed_passages, vector_bytes


def _stored_book(session: Session, book: CorpusBook) -> Book:
    stored = session.exec(
        select(Book).where(func.json_extract(Book.book_metadata, "$.sha256") == book.sha256)
    ).first()
    if stored is None:
        raise CorpusError(f"{book.file}: not in this database; run load-corpus first")
    return stored


def _is_indexed(session: Session, book: CorpusBook, book_id: int, model_name: str) -> bool:
    """Whether the book's chunks are stored at this chunker version, each with a vector.

    Raises:
        CorpusError: The chunks are stored, but their vectors are by another model.
    """
    chunk_ids = select(Chunk.id).where(
        Chunk.book_id == book_id, Chunk.chunker_version == CHUNKER_VERSION
    )
    chunks = session.exec(select(func.count()).select_from(chunk_ids.subquery())).one()
    if not chunks:
        return False
    vectors = session.exec(
        select(func.count())
        .select_from(ChunkVector)
        .where(col(ChunkVector.chunk_id).in_(chunk_ids), ChunkVector.model == model_name)
    ).one()
    if vectors != chunks:
        raise CorpusError(
            f"{book.file}: {vectors} of its {chunks} chunks have vectors for {model_name}; "
            "it was indexed with another model"
        )
    return True


def _store(
    session: Session, book_id: int, chunks: list[TextChunk], model: Embedder, model_name: str
) -> None:
    """Write one book's chunks and vectors in one transaction: all of them, or none."""
    try:
        vectors = embed_passages(model, [chunk.text for chunk in chunks])
        rows = [
            Chunk(
                book_id=book_id,
                position=chunk.position,
                spine_index=chunk.spine_index,
                chapter_title=chunk.chapter_title,
                text=chunk.text,
                word_count=chunk.word_count,
                token_count=chunk.token_count,
                chunker_version=CHUNKER_VERSION,
            )
            for chunk in chunks
        ]
        session.add_all(rows)
        session.flush()
        session.add_all(
            ChunkVector(chunk_id=row.id, model=model_name, vector=vector_bytes(vector))
            for row, vector in zip(rows, vectors, strict=True)
        )
        session.commit()
    except BaseException:
        session.rollback()
        raise


def index_books(
    session: Session,
    books: list[CorpusBook],
    digests: dict[str, str],
    settings: Settings,
    model: Embedder,
    progress: Callable[[str], None] | None = None,
) -> tuple[int, int]:
    """Chunk and embed every test book not yet indexed at this chunker version.

    Every book is found and chunked, and its chunks checked, before anything is written.
    Then each book is written in its own transaction, so a stop leaves whole books only.

    Args:
        session: Open session on the experiment database.
        books: From `read_corpus`; pilot books are left out.
        digests: From `read_digests`.
        settings: Names the model and the library directory.
        model: The embedding model.
        progress: Told about each book once it is stored.

    Returns:
        How many books were indexed now, and how many already were.

    Raises:
        CorpusError: A test book is not in the database, its file is broken, its chunks are
            not the frozen ones, or it was indexed with another model.
    """
    tests = [(book, _stored_book(session, book)) for book in books if book.role == "test"]
    todo = [
        (book, stored)
        for book, stored in tests
        if not _is_indexed(session, book, stored.id, settings.embedding_model)
    ]
    chunked = [
        (
            book,
            stored,
            frozen_chunks(
                storage.resolve(stored.file_path, settings.library_dir),
                book.file,
                model.token_count,
                digests,
            ),
        )
        for book, stored in todo
    ]
    for book, stored, chunks in chunked:
        _store(session, stored.id, chunks, model, settings.embedding_model)
        if progress:
            progress(f"{book.file}: {len(chunks)} chunks")
    return len(chunked), len(tests) - len(chunked)
