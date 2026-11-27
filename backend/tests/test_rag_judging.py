"""`rag judge-pool` and `rag judge`: the checked sample of protocol section 11, check 3."""

import dataclasses
import json
from collections.abc import Iterator
from datetime import date
from pathlib import Path

import pytest

from app.cli import main
from rag.corpus import CorpusError
from rag.descriptors import append_log, read_log
from rag.evaluate import QUESTION_SETS, source_chunk
from rag.judging import (
    CHECKED_QUESTIONS,
    POOL_DEPTH,
    RELEVANT_PROMPT,
    SOURCE_PROMPT,
    Judgement,
    build_pool,
    read_judgements,
    run_judging,
    sample_questions,
    to_judge,
    write_pool,
)
from rag.search import METHODS, search
from tests.corpus_helpers import write_csv
from tests.fake_embedder import FakeEmbedder
from tests.test_rag_describe import make_corpus
from tests.test_rag_evaluate import Lab, lab_fixture  # noqa: F401

HAND, DRAFTED = QUESTION_SETS
TODAY = date(2026, 11, 28)


def many(lab: Lab, count: int) -> list:
    return [dataclasses.replace(lab.records[0], id=f"hand-{n:03d}") for n in range(count)]


def test_the_sample_is_fixed_holds_only_used_questions_and_names_their_set(lab: Lab) -> None:
    records = many(lab, CHECKED_QUESTIONS + 20)
    records[0] = dataclasses.replace(records[0], status="skipped", question=None, kind=None)
    drafted = [dataclasses.replace(lab.records[1], id="draft-001")]

    sample = sample_questions({HAND: records, DRAFTED: drafted})

    assert len(sample) == CHECKED_QUESTIONS
    assert sample == sample_questions({HAND: records, DRAFTED: drafted})
    assert records[0].id not in {record.id for _, record in sample}
    assert all(name == (DRAFTED if r.id == "draft-001" else HAND) for name, r in sample)


def test_the_sample_does_not_depend_on_the_order_of_the_records(lab: Lab) -> None:
    records = many(lab, CHECKED_QUESTIONS + 20)

    assert sample_questions({HAND: records}) == sample_questions({HAND: records[::-1]})


def test_too_few_questions_for_the_sample_are_refused(lab: Lab) -> None:
    with pytest.raises(CorpusError, match="the checked sample needs"):
        sample_questions({HAND: many(lab, CHECKED_QUESTIONS - 1)})


def test_the_pool_holds_each_methods_first_chunks_and_marks_the_source(lab: Lab) -> None:
    questions = lab.questions()

    pool = build_pool(
        lab.session, lab.books, lab.vectors, lab.descriptors, FakeEmbedder(), questions
    )

    for question in questions:
        source = source_chunk(lab.session, lab.records[questions.index(question)])
        for method in METHODS:
            expected = search(
                lab.session,
                lab.vectors,
                FakeEmbedder(),
                question.text,
                method,
                descriptors=lab.descriptors,
                query_descriptors=question.descriptor_vectors,
            )[:POOL_DEPTH]
            mine = [
                line
                for line in pool
                if line["question"] == question.id and line["method"] == method
            ]
            assert [line["rank"] for line in mine] == list(range(1, len(expected) + 1))
            assert [line["position"] for line in mine] == [
                lab.session.get(type(source), chunk_id).position for chunk_id in expected
            ]
            assert [line["is_source"] for line in mine] == [c == source.id for c in expected]
        line = next(line for line in pool if line["question"] == question.id)
        assert (line["source_position"], line["set"], line["text"]) == (
            source.position,
            HAND,
            question.text,
        )


def test_a_pool_is_never_written_over(tmp_path: Path) -> None:
    out = tmp_path / "pool.jsonl"
    write_pool(out, [{"question": "hand-001"}])

    with pytest.raises(CorpusError, match="never written over"):
        write_pool(out, [])
    assert read_log(out) == [{"question": "hand-001"}]


def pool_line(question: str, position: int, method: str, is_source: bool = False) -> dict:
    return {
        "question": question,
        "book_sha256": "a" * 64,
        "position": position,
        "method": method,
        "is_source": is_source,
    }


def test_each_found_chunk_is_judged_once_never_the_source_in_a_fixed_shuffle() -> None:
    pool = [
        pool_line("q-2", 9, "bm25", is_source=True),
        pool_line("q-1", 1, "bm25"),
        pool_line("q-1", 0, "bm25", is_source=True),
        *(pool_line("q-1", n, "dense") for n in range(1, 8)),
    ]

    work = to_judge(pool)

    assert [question["question"] for question, _ in work] == ["q-2", "q-1"]
    assert work[0][1] == []
    positions = [line["position"] for line in work[1][1]]
    assert sorted(positions) == list(range(1, 8))
    assert positions != sorted(positions)
    assert positions == [line["position"] for line in to_judge(list(reversed(pool)))[0][1]]


@pytest.fixture(name="pool")
def pool_fixture(lab: Lab, tmp_path: Path) -> Path:
    path = tmp_path / "pool.jsonl"
    write_pool(
        path,
        build_pool(
            lab.session, lab.books, lab.vectors, lab.descriptors, FakeEmbedder(), lab.questions()
        ),
    )
    return path


def answering(answers: list[str], prompts: list[str]):
    it: Iterator[str] = iter(answers)

    def ask(prompt: str) -> str:
        prompts.append(prompt)
        return next(it)

    return ask


def judge(lab: Lab, pool: Path, out: Path, answers: list[str], shown: list[str] | None = None):
    prompts: list[str] = []
    screens = [] if shown is None else shown
    judged = run_judging(
        lab.session, lab.books, pool, out, answering(answers, prompts), screens.append, TODAY
    )
    return judged, prompts


def test_judging_records_each_found_chunk_and_never_asks_about_the_source(
    lab: Lab, pool: Path, tmp_path: Path
) -> None:
    work = to_judge(read_log(pool))
    answers = []
    for _, chunks in work:
        if chunks:
            answers += ["", "x", *("y" if n % 2 == 0 else "n" for n in range(len(chunks)))]
    out = tmp_path / "judgements.jsonl"
    shown: list[str] = []

    judged, prompts = judge(lab, pool, out, answers, shown)

    total = sum(len(chunks) for _, chunks in work)
    assert judged == total > 0
    records = read_judgements(out)
    assert [(r.question, r.position) for r in records] == [
        (question["question"], line["position"]) for question, chunks in work for line in chunks
    ]
    sources = {(q["question"], q["source_book_sha256"], q["source_position"]) for q, _ in work}
    assert not sources & {(r.question, r.book_sha256, r.position) for r in records}
    assert records[0].relevant is True
    assert prompts.count(SOURCE_PROMPT) == sum(1 for _, chunks in work if chunks)
    assert prompts.count(RELEVANT_PROMPT) == total + prompts.count(SOURCE_PROMPT)
    assert shown[-1] == f"All {total} found chunks are judged."


def test_judging_stops_on_q_and_resumes_after_the_last_judgement(
    lab: Lab, pool: Path, tmp_path: Path
) -> None:
    out = tmp_path / "judgements.jsonl"
    total = sum(len(chunks) for _, chunks in to_judge(read_log(pool)))

    assert judge(lab, pool, out, ["", "y", "q"])[0] == 1
    assert judge(lab, pool, out, ["q"])[0] == 0
    first = read_judgements(out)

    judged, _ = judge(lab, pool, out, ["", *["n"] * total, ""] * 2)

    assert judged == total - 1
    assert read_judgements(out)[0] == first[0]


def test_a_resumed_session_skips_a_question_whose_chunks_are_all_judged(
    lab: Lab, pool: Path, tmp_path: Path
) -> None:
    out = tmp_path / "judgements.jsonl"
    first = len(to_judge(read_log(pool))[0][1])
    judge(lab, pool, out, ["", *["y"] * first, "q"])
    shown: list[str] = []

    judge(lab, pool, out, ["q"], shown)

    assert "Question 2/" in shown[0]


def test_a_judgement_file_that_changed_during_the_session_is_refused(
    lab: Lab, pool: Path, tmp_path: Path
) -> None:
    out = tmp_path / "judgements.jsonl"
    judge(lab, pool, out, ["", "y", "q"])
    prompts: list[str] = []

    def ask(prompt: str) -> str:
        prompts.append(prompt)
        if prompt == RELEVANT_PROMPT:
            record = Judgement("hand-999", "x.epub", "b" * 64, 0, 1, False, "2026-11-28")
            append_log(out, dataclasses.asdict(record))
            return "y"
        return ""

    with pytest.raises(CorpusError, match="changed while this session was open"):
        run_judging(lab.session, lab.books, pool, out, ask, lambda _: None, TODAY)
    assert len(read_judgements(out)) == 2


def test_a_chunk_judged_twice_or_a_relevance_that_is_not_true_or_false_is_refused(
    tmp_path: Path,
) -> None:
    record = dataclasses.asdict(Judgement("hand-001", "a.epub", "a" * 64, 3, 1, True, "x"))
    out = tmp_path / "judgements.jsonl"
    out.write_text(json.dumps(record) + "\n" + json.dumps(record) + "\n", encoding="utf-8")
    with pytest.raises(CorpusError, match="line 2: this chunk is judged twice"):
        read_judgements(out)

    out.write_text(json.dumps({**record, "relevant": "yes"}) + "\n", encoding="utf-8")
    with pytest.raises(CorpusError, match="line 1: relevant is not true or false"):
        read_judgements(out)


def test_an_empty_pool_is_refused(lab: Lab, tmp_path: Path) -> None:
    with pytest.raises(CorpusError, match="run rag judge-pool first"):
        judge(lab, tmp_path / "missing.jsonl", tmp_path / "out.jsonl", [])


def test_a_log_saved_without_its_last_line_break_still_gets_a_line_of_its_own(
    tmp_path: Path,
) -> None:
    log = tmp_path / "log.jsonl"
    log.write_text('{"n": 1}', encoding="utf-8")

    append_log(log, {"n": 2})

    assert read_log(log) == [{"n": 1}, {"n": 2}]


def test_the_pool_command_refuses_a_changed_input_before_it_searches(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    corpus_csv = write_csv(
        tmp_path / "corpus.csv", [dataclasses.asdict(b) for b in make_corpus(tmp_path / "files")]
    )
    empty = tmp_path / "empty.jsonl"
    empty.write_text("", encoding="utf-8")
    run = tmp_path / "run"
    run.mkdir()
    (run / "run.json").write_text(json.dumps({"sha256": {}}), encoding="utf-8")
    inputs = ["--hand", "--review", "--query-descriptors", "--descriptors"]

    code = main(
        [
            "rag",
            "judge-pool",
            str(corpus_csv),
            *(part for flag in inputs for part in (flag, str(empty))),
            "--run",
            str(run),
            "--out",
            str(tmp_path / "pool.jsonl"),
        ]
    )

    assert code == 1
    assert "is not the corpus.csv this run was made from" in capsys.readouterr().err
    assert not (tmp_path / "pool.jsonl").exists()
