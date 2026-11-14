"""The smoke test: self-retrieval per method, and only after the hand set is complete."""

import dataclasses
import json
from pathlib import Path

import pytest
from sqlmodel import Session

from app.cli import main
from app.config import Settings
from rag.chunking import CHUNKER_VERSION, SHORT_CHUNK_WORDS
from rag.corpus import CorpusBook, CorpusError, book_stats, load_corpus, write_stats
from rag.index import index_books
from rag.metrics import K_VALUES
from rag.questions import HAND_SET_SIZE, HandRecord
from rag.search import METHODS, VectorIndex
from rag.smoke import smoke
from tests.corpus_helpers import chapters_book, row, words_as_tokens, write_csv
from tests.fake_embedder import FakeEmbedder

LONG_CHUNKS = 8


def hand_set(kept: int) -> list[HandRecord]:
    """`kept` valid kept records, one per made-up book."""
    return [
        HandRecord(
            id=f"hand-{i:03d}",
            status="kept",
            file=f"{i}.epub",
            book_sha256=f"{i:064x}",
            genre="fiction",
            position=0,
            chunker_version=CHUNKER_VERSION,
            chunks_sha256="0" * 64,
            attempt=0,
            question=f"Question {i}?",
            kind="factual",
            reason=None,
            written_at="2026-10-19",
        )
        for i in range(1, kept + 1)
    ]


@pytest.fixture(name="vectors")
def vectors_fixture(session: Session, settings: Settings, tmp_path: Path) -> VectorIndex:
    """Two indexed books of eight 120-word chunks and one short chunk, every word unique."""
    folder = tmp_path / "files"
    sizes = [120] * LONG_CHUNKS + [SHORT_CHUNK_WORDS - 1]
    books = [CorpusBook(**row(chapters_book(folder, f"{name}.epub", sizes))) for name in "ab"]
    digests = {s.book.file: s.chunks_sha256 for s in book_stats(books, folder, words_as_tokens)}
    load_corpus(session, books, folder, settings)
    index_books(session, books, digests, settings, FakeEmbedder())
    return VectorIndex.load(session, settings.embedding_model)


def test_smoke_refuses_before_the_hand_set_is_complete(
    session: Session, vectors: VectorIndex, monkeypatch: pytest.MonkeyPatch
) -> None:
    def no_search(*args: object, **kwargs: object) -> list[int]:
        raise AssertionError("searched before the hand set was complete")

    monkeypatch.setattr("rag.smoke.search", no_search)
    model = FakeEmbedder()

    with pytest.raises(CorpusError, match="hand questions first"):
        smoke(session, vectors, model, hand_set(HAND_SET_SIZE - 1))

    assert model.embedded == []


def test_skipped_records_do_not_count_toward_the_hand_set(
    session: Session, vectors: VectorIndex
) -> None:
    records = hand_set(HAND_SET_SIZE)
    records[0] = dataclasses.replace(
        records[0], status="skipped", question=None, kind=None, reason="no fact"
    )

    with pytest.raises(CorpusError, match="hand questions first"):
        smoke(session, vectors, FakeEmbedder(), records)


def test_smoke_reports_recall_per_method(session: Session, vectors: VectorIndex) -> None:
    recall = smoke(session, vectors, FakeEmbedder(), hand_set(HAND_SET_SIZE), sample=10)

    assert tuple(recall) == METHODS
    assert recall["bm25"] == 1.0
    assert all(0.0 <= value <= 1.0 for value in recall.values())


def test_the_queries_are_the_first_twelve_words_of_each_sampled_chunk(
    session: Session, vectors: VectorIndex
) -> None:
    model = FakeEmbedder()

    smoke(session, vectors, model, hand_set(HAND_SET_SIZE), sample=3)

    queries = {text.split(": ", 1)[1] for text in model.embedded}
    assert len(queries) == 3
    assert all(len(query.split()) == 12 for query in queries)


def test_only_chunks_of_100_words_or_more_are_sampled(
    session: Session, vectors: VectorIndex
) -> None:
    model = FakeEmbedder()

    smoke(session, vectors, model, hand_set(HAND_SET_SIZE), sample=100)

    assert len({text.split(": ", 1)[1] for text in model.embedded}) == 2 * LONG_CHUNKS


def test_smoke_command_refuses_and_names_the_hand_set(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    hand = tmp_path / "hand.jsonl"
    lines = [json.dumps(dataclasses.asdict(record)) for record in hand_set(3)]
    hand.write_text("\n".join(lines) + "\n", encoding="utf-8")

    def no_model(settings: Settings) -> FakeEmbedder:
        raise AssertionError("loaded the model before checking the hand set")

    monkeypatch.setattr("rag.embeddings.load_model", no_model)

    assert main(["rag", "smoke", "--hand", str(hand)]) == 1
    assert f"3 of {HAND_SET_SIZE}" in capsys.readouterr().err


def test_smoke_command_prints_a_line_per_method(
    experiment_db: None,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    folder = tmp_path / "files"
    books = [CorpusBook(**row(chapters_book(folder, f"{name}.epub", [120] * 8))) for name in "ab"]
    corpus_csv = write_csv(tmp_path / "corpus.csv", [dataclasses.asdict(book) for book in books])
    stats = tmp_path / "corpus-stats.csv"
    write_stats(book_stats(books, folder, words_as_tokens), stats)
    monkeypatch.setattr("rag.embeddings.load_model", lambda settings: FakeEmbedder())
    hand = tmp_path / "hand.jsonl"
    lines = [json.dumps(dataclasses.asdict(record)) for record in hand_set(HAND_SET_SIZE)]
    hand.write_text("\n".join(lines) + "\n", encoding="utf-8")
    assert main(["rag", "load-corpus", str(corpus_csv), str(folder)]) == 0
    assert main(["rag", "index", str(corpus_csv), "--stats", str(stats)]) == 0

    assert main(["rag", "smoke", "--hand", str(hand), "--sample", "5"]) == 0

    out = capsys.readouterr().out
    assert f"bm25: recall@{max(K_VALUES)} = 1.00" in out
    assert all(f"{method}: recall@" in out for method in METHODS)
