"""`rag evaluate`: the rank of every question's source chunk by every method."""

import csv
import dataclasses
import hashlib
import json
from pathlib import Path

import pytest
from sqlmodel import Session

from app.cli import main
from app.config import Settings
from rag.chunking import CHUNKER_VERSION
from rag.corpus import CorpusBook, CorpusError, book_stats, load_corpus, write_stats
from rag.descriptors import (
    PROMPT_VERSION,
    QUESTION_DESCRIPTORS,
    append_log,
    import_descriptors,
)
from rag.evaluate import (
    PROTOCOL_VERSION,
    check_stored_chunks,
    load_questions,
    rank_questions,
    summarize,
    write_run,
)
from rag.index import index_books, indexed_chunks
from rag.metrics import K_VALUES, MRR_K
from rag.questions import HAND_SET_SIZE, HandRecord
from rag.search import METHODS, DescriptorIndex, VectorIndex
from tests.corpus_helpers import chapters_book, row, words_as_tokens, write_csv
from tests.fake_embedder import FakeEmbedder
from tests.test_rag_describe import make_corpus
from tests.test_rag_import_descriptors import entry


def hand_record(book: CorpusBook, position: int, number: int, kind: str = "factual") -> HandRecord:
    return HandRecord(
        id=f"hand-{number:03d}",
        status="kept",
        file=book.file,
        book_sha256=book.sha256,
        genre=book.genre,
        position=position,
        chunker_version=CHUNKER_VERSION,
        chunks_sha256="0" * 64,
        attempt=0,
        question=f"What happens in {book.file} chunk {position}?",
        kind=kind,
        reason=None,
        written_at="2026-11-22",
    )


def question_entry(record: HandRecord, descriptors: list[str], status: str = "ok") -> dict:
    """A question descriptor log entry, as `rag describe-questions` writes it."""
    return {
        "kind": "question",
        "id": record.id,
        "question": record.question,
        "prompt_version": PROMPT_VERSION,
        "status": status,
        "raw": json.dumps({"descriptors": descriptors}),
    }


def own_descriptors(file: str, position: int) -> list[str]:
    """The first descriptors of a chunk's own log entry: a perfect MaxSim match."""
    return json.loads(entry(file, position)["raw"])["descriptors"][:QUESTION_DESCRIPTORS]


@dataclasses.dataclass
class Lab:
    books: list[CorpusBook]
    session: Session
    digests: dict[str, str]
    vectors: VectorIndex
    descriptors: DescriptorIndex
    records: list[HandRecord]
    queries: list[dict]

    def questions(self) -> list:
        return load_questions(self.session, self.records, self.queries, FakeEmbedder(), "hand")

    def rows(self) -> list[dict]:
        return rank_questions(
            self.session, self.vectors, self.descriptors, FakeEmbedder(), self.questions()
        )


@pytest.fixture(name="lab")
def lab_fixture(tmp_path: Path, session: Session, settings: Settings) -> Lab:
    """Two indexed test books with descriptors; one question on each, about chunk 1."""
    folder = tmp_path / "files"
    books = make_corpus(folder)
    digests = {s.book.file: s.chunks_sha256 for s in book_stats(books, folder, words_as_tokens)}
    load_corpus(session, books, folder, settings)
    index_books(session, books, digests, settings, FakeEmbedder())
    log = [
        entry(book.file, chunk.position)
        for book in books
        if book.role == "test"
        for chunk in indexed_chunks(session, book)
    ]
    import_descriptors(session, books, log, settings, FakeEmbedder())
    tests = [book for book in books if book.role == "test"]
    records = [
        hand_record(book, 1, n, kind)
        for n, (book, kind) in enumerate(
            zip(tests, ("factual", "interpretive"), strict=True), start=1
        )
    ]
    queries = [question_entry(r, own_descriptors(r.file, r.position)) for r in records]
    return Lab(
        books,
        session,
        digests,
        VectorIndex.load(session, settings.embedding_model),
        DescriptorIndex.load(session, PROMPT_VERSION, settings.embedding_model),
        records,
        queries,
    )


def test_each_question_gets_a_rank_from_each_method(lab: Lab) -> None:
    rows = lab.rows()

    assert len(rows) == len(lab.records) * len(METHODS)
    assert {(row["question"], row["method"]) for row in rows} == {
        (record.id, method) for record in lab.records for method in METHODS
    }
    assert {row["genre"] for row in rows} == {"fiction", "non-fiction"}


def test_the_source_chunk_is_the_one_the_question_was_written_on(lab: Lab) -> None:
    """Its descriptors are the chunk's own, so descriptor search must rank it first."""
    rows = lab.rows()

    assert {row["rank"] for row in rows if row["method"] == "descriptors"} == {1}


def test_a_question_whose_descriptors_failed_is_a_miss_for_descriptors_only(lab: Lab) -> None:
    record = lab.records[0]
    lab.queries[0] = question_entry(record, ["two words"] * 2, status="failed")

    rows = [row for row in lab.rows() if row["question"] == record.id]

    by_method = {row["method"]: row["rank"] for row in rows}
    assert by_method["descriptors"] is None
    assert by_method["dense+descriptors"] == by_method["dense"]


def test_a_question_without_a_descriptor_entry_is_refused(lab: Lab) -> None:
    lab.queries.pop()

    with pytest.raises(CorpusError, match="hand-002: no question descriptors"):
        lab.questions()


def test_a_descriptor_entry_for_another_text_is_refused(lab: Lab) -> None:
    lab.queries[0]["question"] = "Another question?"

    with pytest.raises(CorpusError, match="hand-001: the descriptor log has another text"):
        lab.questions()


def test_a_source_chunk_that_is_not_stored_is_refused(lab: Lab) -> None:
    lab.records[0] = dataclasses.replace(lab.records[0], position=999)

    with pytest.raises(CorpusError, match="hand-001: its source chunk is not stored"):
        lab.questions()


def test_stored_chunks_that_differ_from_the_frozen_ones_are_refused(lab: Lab) -> None:
    lab.digests["a.epub"] = "0" * 64

    with pytest.raises(CorpusError, match="a.epub: the stored chunks differ"):
        check_stored_chunks(lab.session, lab.books, lab.digests)


def test_the_stored_chunks_of_an_indexed_corpus_pass(lab: Lab) -> None:
    check_stored_chunks(lab.session, lab.books, lab.digests)


def test_the_summary_counts_recall_and_mrr_by_genre() -> None:
    rows = [
        {"method": method, "genre": genre, "rank": rank}
        for method in METHODS
        for genre, rank in (("fiction", 1), ("fiction", 7), ("non-fiction", None))
    ]

    summary = {(line["method"], line["genre"]): line for line in summarize(rows)}

    k_small, k_large = K_VALUES
    everything = summary[(METHODS[0], "all")]
    assert everything["questions"] == 3
    assert everything[f"recall@{k_small}"] == round(1 / 3, 4)
    assert everything[f"recall@{k_large}"] == round(2 / 3, 4)
    assert everything[f"mrr@{MRR_K}"] == round((1 + 1 / 7) / 3, 4)
    assert summary[(METHODS[0], "fiction")][f"recall@{k_large}"] == 1.0
    assert summary[(METHODS[0], "non-fiction")][f"recall@{k_large}"] == 0.0


def test_a_run_writes_its_files_and_the_hashes_of_its_inputs(lab: Lab, tmp_path: Path) -> None:
    rows = lab.rows()
    source = tmp_path / "input.txt"
    source.write_text("input", encoding="utf-8")
    out = tmp_path / "runs" / "first"

    write_run(out, rows, summarize(rows), {"input.txt": source}, {"git_commit": "abc"})

    with (out / "ranks.csv").open(encoding="utf-8") as handle:
        assert len(list(csv.DictReader(handle))) == len(rows)
    assert (out / "summary.md").read_text(encoding="utf-8").startswith("| method |")
    run = json.loads((out / "run.json").read_text(encoding="utf-8"))
    assert run["protocol"] == PROTOCOL_VERSION
    assert run["prompt_version"] == PROMPT_VERSION
    assert run["git_commit"] == "abc"
    assert run["sha256"] == {"input.txt": hashlib.sha256(b"input").hexdigest()}


def test_a_run_never_writes_over_another(lab: Lab, tmp_path: Path) -> None:
    rows = lab.rows()
    out = tmp_path / "run"
    out.mkdir()

    with pytest.raises(CorpusError, match="exists"):
        write_run(out, rows, summarize(rows), {}, {})


def test_the_command_ranks_the_hand_set_and_writes_a_run(
    experiment_db: None,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Forty small books, one hand question each: the command needs the whole hand set."""
    folder = tmp_path / "files"
    books = [
        CorpusBook(
            **row(
                chapters_book(folder, f"book{n:02d}.epub", [150, 120]),
                genre=("fiction", "non-fiction")[n % 2],
            )
        )
        for n in range(HAND_SET_SIZE)
    ]
    corpus_csv = write_csv(tmp_path / "corpus.csv", [dataclasses.asdict(b) for b in books])
    stats = tmp_path / "corpus-stats.csv"
    write_stats(book_stats(books, folder, words_as_tokens), stats)
    monkeypatch.setattr("rag.embeddings.load_model", lambda settings: FakeEmbedder())
    assert main(["rag", "load-corpus", str(corpus_csv), str(folder)]) == 0
    assert main(["rag", "index", str(corpus_csv), "--stats", str(stats)]) == 0
    chunk_log = tmp_path / "descriptors.jsonl"
    for book in books:
        for position in range(2):
            append_log(chunk_log, entry(book.file, position))
    assert main(["rag", "import-descriptors", str(corpus_csv), "--log", str(chunk_log)]) == 0
    hand = tmp_path / "hand.jsonl"
    query_log = tmp_path / "query-descriptors.jsonl"
    records = [hand_record(book, 0, n) for n, book in enumerate(books, start=1)]
    hand.write_text(
        "".join(json.dumps(dataclasses.asdict(r)) + "\n" for r in records), encoding="utf-8"
    )
    for record in records:
        append_log(query_log, question_entry(record, own_descriptors(record.file, 0)))
    out = tmp_path / "runs" / "test"
    args = [
        "rag",
        "evaluate",
        str(corpus_csv),
        "--stats",
        str(stats),
        "--hand",
        str(hand),
        "--query-descriptors",
        str(query_log),
        "--descriptors",
        str(chunk_log),
        "--out",
        str(out),
    ]

    assert main(args) == 0
    assert main(args) == 1

    captured = capsys.readouterr()
    assert f"Ranked {HAND_SET_SIZE} questions by {len(METHODS)} methods." in captured.out
    assert "exists" in captured.err
    summary = (out / "summary.csv").read_text(encoding="utf-8")
    assert "descriptors,all,40,1.0,1.0,1.0" in summary
    run = json.loads((out / "run.json").read_text(encoding="utf-8"))
    assert set(run["sha256"]) == {
        "corpus.csv",
        "corpus-stats.csv",
        "hand.jsonl",
        "query-descriptors.jsonl",
        "descriptors.jsonl",
    }
    assert run["questions"] == HAND_SET_SIZE
