"""Embedding chunks and questions, and indexing the test books for search."""

import dataclasses
from collections.abc import Callable
from pathlib import Path

import numpy as np
import pytest
from sqlmodel import Session, select

from app import library
from app.cli import main
from app.config import Settings, get_settings
from app.db import get_engine, run_migrations
from app.models import Chunk, ChunkVector
from rag.chunking import CHUNKER_VERSION
from rag.corpus import CorpusBook, CorpusError, book_stats, load_corpus, write_stats
from rag.embeddings import (
    QUERY_PREFIX,
    embed_passages,
    embed_query,
    vector_bytes,
    vector_from_bytes,
)
from rag.index import index_books
from tests.corpus_helpers import chapters_book, make_book, row, words_as_tokens, write_csv
from tests.fake_embedder import FakeEmbedder

SIZES = [150, 50, 300]


@dataclasses.dataclass
class Library:
    books: list[CorpusBook]
    folder: Path
    digests: dict[str, str]


@pytest.fixture(name="corpus")
def corpus_fixture(tmp_path: Path) -> Library:
    """Two test books and a pilot book, with their frozen digests."""
    folder = tmp_path / "files"
    books = [
        CorpusBook(**row(chapters_book(folder, "a.epub", SIZES))),
        CorpusBook(**row(chapters_book(folder, "b.epub", SIZES), genre="non-fiction")),
        CorpusBook(**row(chapters_book(folder, "p.epub", SIZES), role="pilot")),
    ]
    stats = book_stats(books, folder, words_as_tokens)
    return Library(books, folder, {s.book.file: s.chunks_sha256 for s in stats})


@pytest.fixture(name="loaded")
def loaded_fixture(corpus: Library, session: Session, settings: Settings) -> Library:
    load_corpus(session, corpus.books, corpus.folder, settings)
    return corpus


def chunk_count(session: Session) -> int:
    return len(session.exec(select(Chunk)).all())


def test_a_query_gets_the_prefix_and_a_chunk_does_not() -> None:
    model = FakeEmbedder()

    embed_query(model, "Why does the ship stop?")
    embed_passages(model, ["The ship stops for water."])

    assert model.embedded == [QUERY_PREFIX + "Why does the ship stop?", "The ship stops for water."]


def test_vectors_are_float32_unit_length() -> None:
    vectors = embed_passages(FakeEmbedder(dim=8), ["one", "two words"])

    assert vectors.dtype == np.float32
    assert vectors.shape == (2, 8)
    assert np.linalg.norm(vectors, axis=1) == pytest.approx([1.0, 1.0], abs=1e-6)
    assert np.linalg.norm(embed_query(FakeEmbedder(dim=8), "q")) == pytest.approx(1.0, abs=1e-6)


def test_vector_bytes_round_trip() -> None:
    vector = embed_passages(FakeEmbedder(dim=8), ["one"])[0]

    data = vector_bytes(vector)

    assert len(data) == 8 * 4
    assert np.array_equal(vector_from_bytes(data), vector)


def test_indexing_stores_every_chunk_and_one_vector_each(
    loaded: Library, session: Session, settings: Settings
) -> None:
    progress: list[str] = []

    assert index_books(
        session, loaded.books, loaded.digests, settings, FakeEmbedder(), progress.append
    ) == (2, 0)

    chunks = session.exec(select(Chunk).order_by(Chunk.book_id, Chunk.position)).all()
    assert [chunk.position for chunk in chunks] == [0, 1, 2, 0, 1, 2]
    assert {chunk.chunker_version for chunk in chunks} == {CHUNKER_VERSION}
    assert [chunk.word_count for chunk in chunks[:3]] == SIZES
    vectors = session.exec(select(ChunkVector)).all()
    assert sorted(vector.chunk_id for vector in vectors) == sorted(chunk.id for chunk in chunks)
    assert {vector.model for vector in vectors} == {settings.embedding_model}
    assert {len(vector.vector) for vector in vectors} == {8 * 4}
    assert len(progress) == 2


def test_indexing_twice_adds_nothing(loaded: Library, session: Session, settings: Settings) -> None:
    index_books(session, loaded.books, loaded.digests, settings, FakeEmbedder())
    model = FakeEmbedder()

    assert index_books(session, loaded.books, loaded.digests, settings, model) == (0, 2)
    assert chunk_count(session) == 6
    assert len(session.exec(select(ChunkVector)).all()) == 6
    assert model.embedded == []


def test_a_book_that_was_not_loaded_is_refused(
    corpus: Library, session: Session, settings: Settings
) -> None:
    load_corpus(session, corpus.books[:1], corpus.folder, settings)

    with pytest.raises(CorpusError, match="b.epub.*load-corpus"):
        index_books(session, corpus.books, corpus.digests, settings, FakeEmbedder())

    assert chunk_count(session) == 0


def test_a_digest_mismatch_is_refused_before_anything_is_written(
    loaded: Library, session: Session, settings: Settings
) -> None:
    digests = {**loaded.digests, "b.epub": "0" * 64}

    with pytest.raises(CorpusError, match="b.epub"):
        index_books(session, loaded.books, digests, settings, FakeEmbedder())

    assert chunk_count(session) == 0


def fail_in_the_model(monkeypatch: pytest.MonkeyPatch) -> FakeEmbedder:
    return FakeEmbedder(fail_on_call=2)


def fail_while_writing(monkeypatch: pytest.MonkeyPatch) -> FakeEmbedder:
    """The second book's second vector fails after its chunk rows went to the database."""
    calls = 0

    def vector_bytes_then_fail(vector: np.ndarray) -> bytes:
        nonlocal calls
        calls += 1
        if calls == len(SIZES) + 2:
            raise RuntimeError("the disk failed")
        return vector_bytes(vector)

    monkeypatch.setattr("rag.index.vector_bytes", vector_bytes_then_fail)
    return FakeEmbedder()


@pytest.mark.parametrize("failure", [fail_in_the_model, fail_while_writing])
def test_a_failed_book_leaves_nothing_and_a_rerun_finishes(
    loaded: Library,
    session: Session,
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
    failure: Callable[[pytest.MonkeyPatch], FakeEmbedder],
) -> None:
    model = failure(monkeypatch)

    with pytest.raises(RuntimeError):
        index_books(session, loaded.books, loaded.digests, settings, model)

    assert chunk_count(session) == len(SIZES)
    assert len(session.exec(select(ChunkVector)).all()) == len(SIZES)
    monkeypatch.undo()
    assert index_books(session, loaded.books, loaded.digests, settings, FakeEmbedder()) == (1, 1)
    assert chunk_count(session) == 2 * len(SIZES)


@pytest.fixture(name="index_args")
def index_args_fixture(
    corpus: Library, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> list[str]:
    """The arguments of `rag index` over the corpus fixture, with a fake model."""
    corpus_csv = write_csv(
        tmp_path / "corpus.csv", [dataclasses.asdict(book) for book in corpus.books]
    )
    stats = tmp_path / "corpus-stats.csv"
    write_stats(book_stats(corpus.books, corpus.folder, words_as_tokens), stats)
    monkeypatch.setattr("rag.embeddings.load_model", lambda settings: FakeEmbedder())
    return ["rag", "index", str(corpus_csv), "--stats", str(stats)]


def test_index_command_reports_what_it_indexed(
    experiment_db: None,
    corpus: Library,
    index_args: list[str],
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    assert main(["rag", "load-corpus", index_args[2], str(corpus.folder)]) == 0

    assert main(index_args) == 0
    assert main(index_args) == 0

    out = capsys.readouterr().out
    assert "Indexed 2 books; 0 were already indexed." in out
    assert "Indexed 0 books; 2 were already indexed." in out


def test_index_command_refuses_a_real_library_before_migrating(
    experiment_db: None,
    index_args: list[str],
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    run_migrations()
    mine = make_book(tmp_path / "elsewhere", "mine.epub", 10)
    with Session(get_engine()) as session, mine.open("rb") as source:
        library.add_book_from_file(session, source, "mine.epub", get_settings(), uploaded_by=None)

    def refuse_to_migrate() -> None:
        raise AssertionError("migrated a database it should have refused")

    monkeypatch.setattr("app.cli.run_migrations", refuse_to_migrate)

    assert main(index_args) == 1
    assert "not in corpus.csv" in capsys.readouterr().err
