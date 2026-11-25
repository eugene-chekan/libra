"""`rag report`: the statistics, tables and chart of a run, from ranks.csv alone."""

import csv
from pathlib import Path

import numpy as np
import pytest

from app.cli import main
from rag.corpus import CorpusError
from rag.evaluate import GENRES
from rag.questions import QUESTION_KINDS
from rag.report import (
    BASELINES,
    MAIN_K,
    METHOD,
    gain_difference_test,
    holm,
    paired_test,
    read_ranks,
    recall_table,
    run_tests,
    write_report,
)
from rag.search import METHODS


def ranks(questions: int = 24, winner: str = METHOD, fiction_only: bool = False) -> list[dict]:
    """A run's rows: `winner` finds every source chunk at rank 1; the others miss.

    With `fiction_only`, the winner finds only the fiction questions' chunks.
    """
    rows = []
    for n in range(questions):
        genre = GENRES[n % 2]
        kind = QUESTION_KINDS[(n // 2) % 2]
        for method in METHODS:
            found = method == winner and (not fiction_only or genre == GENRES[0])
            rows.append(
                {
                    "question": f"q-{n:03d}",
                    "set": "hand",
                    "genre": genre,
                    "kind": kind,
                    "method": method,
                    "rank": 1 if found else None,
                }
            )
    return rows


def write_ranks(folder: Path, rows: list[dict]) -> Path:
    folder.mkdir(parents=True)
    with (folder / "ranks.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]), lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    return folder


def test_holm_multiplies_by_the_remaining_count_and_keeps_the_order() -> None:
    adjusted = holm([0.01, 0.04, 0.03, 0.005])

    assert adjusted == pytest.approx([0.03, 0.06, 0.06, 0.02])


def test_holm_never_goes_above_one() -> None:
    assert holm([0.5, 0.6]) == [1.0, 1.0]


def test_a_method_that_always_wins_has_a_difference_of_one_and_a_small_p() -> None:
    difference, low, high, p = paired_test(np.ones(20), np.zeros(20))

    assert (difference, low, high) == (1.0, 1.0, 1.0)
    assert p < 0.001


def test_two_equal_methods_differ_by_nothing() -> None:
    values = np.array([1.0, 0.0] * 10)

    difference, low, high, p = paired_test(values, values)

    assert (difference, low, high, p) == (0.0, 0.0, 0.0, 1.0)


def test_the_interval_holds_the_difference_and_repeats_exactly() -> None:
    method = np.array([1.0, 1.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0] * 4)
    baseline = np.array([1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0] * 4)

    first = paired_test(method, baseline)

    difference, low, high, p = first
    assert difference == pytest.approx((method - baseline).mean())
    assert low <= difference <= high
    assert 0 < p < 1
    assert paired_test(method, baseline) == first


def test_a_gain_in_one_group_only_differs_between_the_groups() -> None:
    difference, low, high, p = gain_difference_test(np.ones(15), np.zeros(15))

    assert (difference, low, high) == (1.0, 1.0, 1.0)
    assert p < 0.001


def test_the_tests_are_h1_h2_per_genre_h3_then_h4() -> None:
    tests = run_tests(ranks())

    assert [test.name for test in tests] == [
        f"{h} {genre}" for h in BASELINES for genre in GENRES
    ] + ["H3", "H4"]
    assert [test.family for test in tests] == ["main"] * 5 + ["secondary"]
    assert tests[-1].p_holm is None
    assert all(test.p_holm >= test.p for test in tests[:5])


def test_a_gain_on_fiction_only_shows_in_h1_fiction_and_in_h3() -> None:
    tests = {test.name: test for test in run_tests(ranks(fiction_only=True))}

    assert tests[f"H1 {GENRES[0]}"].difference == 1.0
    assert tests[f"H1 {GENRES[1]}"].difference == 0.0
    assert tests["H3"].difference == 1.0
    assert tests["H4"].difference == 0.0


def test_the_method_is_compared_with_each_baseline() -> None:
    """The baseline that wins makes that hypothesis negative, and only that one."""
    tests = {test.name: test for test in run_tests(ranks(winner=BASELINES["H2"]))}

    assert tests[f"H2 {GENRES[0]}"].difference == -1.0
    assert tests[f"H1 {GENRES[0]}"].difference == 0.0


def test_the_recall_table_has_each_method_and_genre_with_an_interval() -> None:
    table = recall_table(ranks())

    assert len(table) == len(METHODS) * (1 + len(GENRES))
    winner = next(line for line in table if line["method"] == METHOD and line["genre"] == "all")
    assert (winner[f"recall@{MAIN_K}"], winner["low"], winner["high"]) == (1.0, 1.0, 1.0)


def test_a_rank_past_k_is_a_miss(tmp_path: Path) -> None:
    rows = ranks()
    for row in rows:
        if row["method"] == METHOD:
            row["rank"] = MAIN_K + 1
    run = write_ranks(tmp_path / "run", rows)

    table = recall_table(read_ranks(run / "ranks.csv"))

    assert all(line[f"recall@{MAIN_K}"] == 0.0 for line in table)


def test_a_report_writes_its_files_once(tmp_path: Path) -> None:
    run = write_ranks(tmp_path / "run", ranks())

    write_report(run)

    for name in ("tests.csv", "recall.csv", "report.md", "recall.png"):
        assert (run / name).stat().st_size > 0, name
    report = (run / "report.md").read_text(encoding="utf-8")
    assert f"| H1 {GENRES[0]} |" in report
    assert "![recall by method and genre](recall.png)" in report
    with pytest.raises(CorpusError, match="has a report already"):
        write_report(run)


def test_the_command_reports_a_run_and_names_a_missing_one(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    run = write_ranks(tmp_path / "run", ranks())

    assert main(["rag", "report", str(run)]) == 0
    assert main(["rag", "report", str(tmp_path / "missing")]) == 1

    captured = capsys.readouterr()
    assert "report.md" in captured.out
    assert "run rag evaluate first" in captured.err


def test_the_paired_p_value_swaps_within_each_question() -> None:
    """Differences 1, 1, 1, 0: of the 16 sign swaps, 4 give a mean as far from 0 (|0.75|)."""
    _, _, _, p = paired_test(np.array([1.0, 1.0, 1.0, 0.0]), np.zeros(4))

    assert p == pytest.approx(4 / 16)


def test_h4_is_the_interpretive_gain_minus_the_factual_gain() -> None:
    rows = ranks()
    for row in rows:
        if row["method"] == METHOD and row["kind"] == QUESTION_KINDS[0]:
            row["rank"] = None

    tests = {test.name: test for test in run_tests(rows)}

    assert QUESTION_KINDS[1] == "interpretive"
    assert tests["H4"].difference == 1.0
