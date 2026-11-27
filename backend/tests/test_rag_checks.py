"""`rag checks`: checks 1, 2 and 4 of protocol section 11 for a run."""

import csv
import dataclasses
import json
from pathlib import Path

import pytest

from app.cli import main
from rag.checks import (
    CHECKS_FILE,
    check_run,
    descriptor_failures,
    method_orders,
    overlap,
    require_run_inputs,
)
from rag.corpus import CorpusError
from rag.descriptors import CHUNK_DESCRIPTORS
from rag.evaluate import GENRES, QUESTION_SETS, file_sha256, source_chunk, summarize, write_run
from rag.index import indexed_chunks
from rag.report import MAIN_K
from rag.search import METHODS
from tests.corpus_helpers import write_csv
from tests.test_rag_describe import make_corpus
from tests.test_rag_evaluate import Lab, lab_fixture, question_entry  # noqa: F401
from tests.test_rag_import_descriptors import entry

HAND, DRAFTED = QUESTION_SETS


def rows_where(winner_by_set: dict[str, str]) -> list[dict]:
    """Two questions per set; each set's winner finds both, every other method misses."""
    return [
        {
            "question": f"{name}-{n}",
            "set": name,
            "genre": GENRES[n],
            "kind": "factual",
            "method": method,
            "rank": 1 if method == winner else None,
        }
        for name, winner in winner_by_set.items()
        for n in range(2)
        for method in METHODS
    ]


def test_overlap_counts_each_word_once_and_a_curly_apostrophe_as_straight() -> None:
    assert overlap("What did Anna’s mother see?", "Anna's mother saw the sea.") == 2 / 5
    assert overlap("the the cat", "a cat") == 1 / 2


def test_each_set_orders_its_methods_by_recall_and_a_tie_keeps_the_protocol_order() -> None:
    orders = method_orders(rows_where({HAND: METHODS[3], DRAFTED: METHODS[0]}))

    assert [method for method, _ in orders[HAND]] == [
        METHODS[3],
        *(m for m in METHODS if m != METHODS[3]),
    ]
    assert orders[HAND][0][1] == 1.0
    assert [method for method, _ in orders[DRAFTED]] == list(METHODS)


def test_a_rank_past_k_is_a_miss_in_the_order() -> None:
    rows = rows_where({HAND: METHODS[3]})
    for row in rows:
        if row["rank"] == 1:
            row["rank"] = MAIN_K + 1

    assert all(value == 0.0 for _, value in method_orders(rows)[HAND])


def test_descriptor_failures_count_the_first_check_and_the_check_of_today(lab: Lab) -> None:
    a, b = (book for book in lab.books if book.role == "test")
    seven = "one two three four five six seven"
    garbage = {**entry(a.file, 2, status="failed"), "raw": "not json"}
    log = [
        entry(a.file, 0),
        entry(a.file, 1, [seven] * CHUNK_DESCRIPTORS, status="failed"),
        entry(a.file, 2),
        garbage,  # a later entry for the same chunk replaces the first
        entry(b.file, 0),
        entry(b.file, 0, status="failed", prompt_version="v0"),  # another prompt
        entry("p.epub", 0, status="failed"),  # a pilot book
    ]
    queries = [
        *lab.queries,
        {**question_entry(lab.records[1], []), "raw": "{}"},
        {**question_entry(lab.records[0], []), "id": "draft-999"},  # not a used question
    ]

    lines = {
        (line["what"], line["genre"]): line
        for line in descriptor_failures(lab.books, log, queries, lab.records)
    }

    assert lines[("chunks", "all")] == {
        "what": "chunks",
        "genre": "all",
        "total": 4,
        "first check": 2,
        "failed": 1,
    }
    assert lines[("chunks", b.genre)]["first check"] == 0
    assert (lines[("questions", "all")]["total"], lines[("questions", "all")]["failed"]) == (2, 1)
    assert lines[("questions", lab.records[1].genre)]["failed"] == 1


def write_lab_run(lab: Lab, run: Path) -> None:
    rows = lab.rows()
    write_run(run, rows, summarize(rows), {}, {})


def test_a_check_writes_its_files_once(lab: Lab, tmp_path: Path) -> None:
    run = tmp_path / "run"
    write_lab_run(lab, run)
    chunk_log = [
        entry(book.file, chunk.position)
        for book in lab.books
        if book.role == "test"
        for chunk in indexed_chunks(lab.session, book)
    ]

    check_run(lab.session, lab.books, run, {HAND: lab.records}, chunk_log, lab.queries)

    for name in (CHECKS_FILE, "orders.csv", "overlap.csv", "failures.csv"):
        assert (run / name).stat().st_size > 0, name
    with (run / "overlap.csv").open(encoding="utf-8") as handle:
        lines = {line["question"]: line for line in csv.DictReader(handle)}
    record = lab.records[0]
    expected = overlap(record.question, source_chunk(lab.session, record).text)
    assert float(lines[record.id]["overlap"]) == pytest.approx(expected, abs=1e-4)
    assert "Both sets order the methods the same way: yes." in (run / CHECKS_FILE).read_text(
        encoding="utf-8"
    )
    with pytest.raises(CorpusError, match="has checks already"):
        check_run(lab.session, lab.books, run, {HAND: lab.records}, chunk_log, lab.queries)


def test_a_file_that_differs_from_the_run_is_refused(tmp_path: Path) -> None:
    hand = tmp_path / "hand.jsonl"
    hand.write_text("one\n", encoding="utf-8")
    run = tmp_path / "run"
    run.mkdir()
    (run / "run.json").write_text(
        json.dumps({"sha256": {"hand.jsonl": file_sha256(hand)}}), encoding="utf-8"
    )

    require_run_inputs(run, {"hand.jsonl": hand})
    hand.write_text("two\n", encoding="utf-8")
    with pytest.raises(CorpusError, match="is not the hand.jsonl this run was made from"):
        require_run_inputs(run, {"hand.jsonl": hand})


def test_the_command_names_a_changed_input_and_a_missing_run(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    corpus_csv = write_csv(
        tmp_path / "corpus.csv", [dataclasses.asdict(b) for b in make_corpus(tmp_path / "files")]
    )
    files = {name: tmp_path / name for name in ("hand", "review", "queries", "chunks")}
    for path in files.values():
        path.write_text("", encoding="utf-8")
    run = tmp_path / "run"
    run.mkdir()
    (run / "run.json").write_text(json.dumps({"sha256": {}}), encoding="utf-8")
    args = [
        "rag",
        "checks",
        str(corpus_csv),
        "--hand",
        str(files["hand"]),
        "--review",
        str(files["review"]),
        "--query-descriptors",
        str(files["queries"]),
        "--descriptors",
        str(files["chunks"]),
        "--run",
    ]

    assert main([*args, str(run)]) == 1
    assert main([*args, str(tmp_path / "missing")]) == 1

    error = capsys.readouterr().err
    assert "is not the corpus.csv this run was made from" in error
    assert "run rag evaluate first" in error
