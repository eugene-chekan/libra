"""`rag import-descriptors`: the chunk descriptor log into the database, with vectors."""

import dataclasses
import json
from pathlib import Path

import numpy as np
import pytest
from sqlmodel import Session, select

from app import library
from app.cli import main
from app.config import Settings
from app.models import Book, Chunk, Descriptor
from rag.corpus import CorpusBook, CorpusError, book_stats, load_corpus, write_stats
from rag.descriptors import (
    CHUNK_DESCRIPTORS,
    PROMPT_VERSION,
    append_log,
    import_descriptors,
    logged_descriptors,
)
from rag.embeddings import embed_passages, vector_from_bytes
from rag.index import index_books, indexed_chunks
from tests.corpus_helpers import words_as_tokens, write_csv
from tests.fake_embedder import FakeEmbedder
from tests.test_rag_describe import make_corpus


def entry(
    file: str,
    position: int,
    descriptors: list[str] | None = None,
    status: str = "ok",
    prompt_version: str = PROMPT_VERSION,
) -> dict:
    """A log entry as `rag describe` writes it; by default 8 distinct 2-word descriptors."""
    if descriptors is None:
        descriptors = [f"{file} {position}-{n}" for n in range(CHUNK_DESCRIPTORS)]
    return {
        "kind": "chunk",
        "file": file,
        "position": position,
        "prompt_version": prompt_version,
        "status": status,
        "descriptors": descriptors if status == "ok" else None,
        "raw": json.dumps({"descriptors": descriptors}),
    }


@dataclasses.dataclass
class Store:
    """The corpus loaded and indexed in a database, and a full log of its chunks."""

    books: list[CorpusBook]
    session: Session
    settings: Settings
    entries: list[dict]

    def run(self, entries: list[dict] | None = None) -> tuple[int, int, int]:
        log = self.entries if entries is None else entries
        return import_descriptors(self.session, self.books, log, self.settings, FakeEmbedder())

    def rows(self) -> list[Descriptor]:
        return list(self.session.exec(select(Descriptor)).all())


@pytest.fixture(name="store")
def store_fixture(tmp_path: Path, session: Session, settings: Settings) -> Store:
    folder = tmp_path / "files"
    books = make_corpus(folder)
    digests = {s.book.file: s.chunks_sha256 for s in book_stats(books, folder, words_as_tokens)}
    load_corpus(session, books, folder, settings)
    index_books(session, books, digests, settings, FakeEmbedder())
    entries = [
        entry(book.file, chunk.position)
        for book in books
        if book.role == "test"
        for chunk in indexed_chunks(session, book)
    ]
    return Store(books, session, settings, entries)


def test_every_chunk_gets_its_descriptors_in_order_with_a_vector(store: Store) -> None:
    assert store.run() == (2, 0, 0)

    rows = store.rows()
    assert len(rows) == len(store.entries) * CHUNK_DESCRIPTORS
    chunk = store.session.get(Chunk, rows[0].chunk_id)
    book = store.session.get(Book, chunk.book_id)
    file = next(b.file for b in store.books if b.sha256 == book.book_metadata["sha256"])
    mine = sorted((r for r in rows if r.chunk_id == chunk.id), key=lambda r: r.position)
    assert [r.text for r in mine] == [f"{file} {chunk.position}-{n}" for n in range(8)]
    assert {(r.prompt_version, r.model) for r in rows} == {
        (PROMPT_VERSION, store.settings.embedding_model)
    }


def test_a_vector_is_the_descriptor_text_embedded_without_a_prefix(store: Store) -> None:
    store.run()

    row = store.rows()[0]
    expected = embed_passages(FakeEmbedder(), [row.text])[0]
    np.testing.assert_allclose(vector_from_bytes(row.vector), expected, rtol=1e-6)


def test_the_raw_answer_is_checked_again_not_the_logged_status(store: Store) -> None:
    """Deviation 1: an answer logged as failed under 2-6 words passes the 1-8 check."""
    one_word = ["hypocrisy"] + ["two words"] * (CHUNK_DESCRIPTORS - 1)
    first = store.entries[0]
    store.entries[0] = entry(first["file"], first["position"], one_word, status="failed")
    second = store.entries[1]
    store.entries[1] = entry(second["file"], second["position"], ["two words"] * 7, "failed")

    assert store.run() == (2, 0, 1)

    texts = {row.text for row in store.rows()}
    assert "hypocrisy" in texts
    assert len(store.rows()) == (len(store.entries) - 1) * CHUNK_DESCRIPTORS


@pytest.mark.parametrize("raw", ["not json", '["a", "list"]', "", None])
def test_an_unreadable_raw_answer_has_no_descriptors(raw: str | None) -> None:
    assert logged_descriptors({"raw": raw}, CHUNK_DESCRIPTORS) is None


def test_a_second_import_adds_nothing(store: Store) -> None:
    store.run()
    count = len(store.rows())

    assert store.run() == (0, 2, 0)

    assert len(store.rows()) == count


def test_a_chunk_missing_from_the_log_is_refused_before_anything_is_written(
    store: Store,
) -> None:
    missing = store.entries.pop()

    with pytest.raises(CorpusError, match=f"{missing['file']} chunk {missing['position']}"):
        store.run()

    assert store.rows() == []


def test_a_chunk_logged_twice_is_refused(store: Store) -> None:
    with pytest.raises(CorpusError, match="logged twice"):
        store.run([*store.entries, store.entries[0]])

    assert store.rows() == []


def test_an_entry_for_a_chunk_that_is_not_stored_is_refused(store: Store) -> None:
    with pytest.raises(CorpusError, match="a.epub chunk 999: not stored"):
        store.run([*store.entries, entry("a.epub", 999)])

    assert store.rows() == []


def test_an_entry_for_a_pilot_book_is_refused(store: Store) -> None:
    with pytest.raises(CorpusError, match="p.epub chunk 0: not a test book"):
        store.run([*store.entries, entry("p.epub", 0)])


def test_entries_of_another_prompt_version_are_left_out(store: Store) -> None:
    old = entry(store.entries[0]["file"], store.entries[0]["position"], prompt_version="v0")

    assert store.run([old, *store.entries]) == (2, 0, 0)

    assert all(row.prompt_version == PROMPT_VERSION for row in store.rows())


def test_a_failed_book_leaves_nothing_and_a_rerun_finishes(store: Store) -> None:
    with pytest.raises(RuntimeError):
        import_descriptors(
            store.session, store.books, store.entries, store.settings, FakeEmbedder(fail_on_call=2)
        )

    first_book = len(store.rows())
    assert first_book > 0
    assert store.run() == (1, 1, 0)
    assert len(store.rows()) == len(store.entries) * CHUNK_DESCRIPTORS


def test_deleting_a_book_deletes_its_descriptors(store: Store) -> None:
    store.run()
    book = store.session.exec(select(Book)).first()

    library.delete_book(store.session, book.id, store.settings)

    chunk_ids = {row.chunk_id for row in store.rows()}
    remaining = set(store.session.exec(select(Chunk.id)).all())
    assert chunk_ids <= remaining
    assert len(store.rows()) < len(store.entries) * CHUNK_DESCRIPTORS


def test_the_command_imports_and_reports(
    experiment_db: None,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    folder = tmp_path / "files"
    books = make_corpus(folder)
    corpus_csv = write_csv(tmp_path / "corpus.csv", [dataclasses.asdict(b) for b in books])
    stats = tmp_path / "corpus-stats.csv"
    write_stats(book_stats(books, folder, words_as_tokens), stats)
    monkeypatch.setattr("rag.embeddings.load_model", lambda settings: FakeEmbedder())
    assert main(["rag", "load-corpus", str(corpus_csv), str(folder)]) == 0
    assert main(["rag", "index", str(corpus_csv), "--stats", str(stats)]) == 0
    log = tmp_path / "descriptors.jsonl"
    counts = {"a.epub": 0, "b.epub": 0}
    for stat in book_stats(books, folder, words_as_tokens):
        if stat.book.file in counts:
            for position in range(stat.chunks):
                append_log(log, entry(stat.book.file, position))

    assert main(["rag", "import-descriptors", str(corpus_csv), "--log", str(log)]) == 0

    out = capsys.readouterr().out
    assert "Imported 2 books; 0 were already imported." in out
    assert "0 chunks of the imported books have no valid descriptors." in out
