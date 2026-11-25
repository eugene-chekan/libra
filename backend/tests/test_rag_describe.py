"""`rag describe`: descriptors for every chunk of the test books, several requests at once."""

import dataclasses
import itertools
import json
import threading
import time
from pathlib import Path

import pytest
from pydantic import SecretStr
from sqlmodel import Session

from app.cli import main
from app.config import Settings, get_settings
from rag.corpus import CorpusBook, CorpusError, book_stats, load_corpus, write_stats
from rag.deepseek import JSON_ATTEMPTS, KEY_SETTING, DeepSeek, StopRunError
from rag.descriptors import (
    CHUNK_DESCRIPTORS,
    PROMPT_VERSION,
    QUESTION_DESCRIPTORS,
    QUESTION_PROMPT,
    RUN_WORKERS,
    read_log,
    run_describe,
    run_describe_questions,
)
from rag.index import index_books, indexed_chunks
from rag.questions import HAND_SET_SIZE, HandRecord
from rag.review import ReviewRecord
from tests.corpus_helpers import chapters_book, row, words_as_tokens, write_csv
from tests.fake_deepseek import FakeDeepSeek, api_error
from tests.fake_embedder import FakeEmbedder
from tests.test_descriptors import CHUNK_ANSWER, QUESTION_ANSWER
from tests.test_rag_smoke import hand_set

SIZES = [150, 120, 300]


def make_corpus(folder: Path) -> list[CorpusBook]:
    """Two test books and a pilot book."""
    return [
        CorpusBook(**row(chapters_book(folder, "a.epub", SIZES))),
        CorpusBook(**row(chapters_book(folder, "b.epub", SIZES), genre="non-fiction")),
        CorpusBook(**row(chapters_book(folder, "p.epub", SIZES), role="pilot")),
    ]


@dataclasses.dataclass
class Run:
    """The corpus loaded and indexed in a database, and what `run_describe` needs."""

    books: list[CorpusBook]
    session: Session
    out: Path
    shown: list[str]

    def __call__(
        self, fake: FakeDeepSeek, workers: int = 2, limit: int | None = None
    ) -> tuple[int, int]:
        client = DeepSeek(Settings(deepseek_api_key=SecretStr("sk-test")), client=fake)
        return run_describe(
            self.session, self.books, client, self.out, workers, self.shown.append, limit
        )

    def chunks(self) -> list[tuple[str, int]]:
        """Every chunk the run should describe: (file, position)."""
        return [
            (book.file, chunk.position)
            for book in self.books
            if book.role == "test"
            for chunk in indexed_chunks(self.session, book)
        ]

    def entries(self) -> list[dict]:
        return read_log(self.out)


@pytest.fixture(name="run")
def run_fixture(tmp_path: Path, session: Session, settings: Settings) -> Run:
    folder = tmp_path / "files"
    books = make_corpus(folder)
    digests = {s.book.file: s.chunks_sha256 for s in book_stats(books, folder, words_as_tokens)}
    load_corpus(session, books, folder, settings)
    index_books(session, books, digests, settings, FakeEmbedder())
    return Run(books, session, tmp_path / "descriptors.jsonl", [])


def answers(count: int) -> list[str | Exception]:
    return [CHUNK_ANSWER] * count


def test_every_chunk_of_the_test_books_gets_one_entry(run: Run) -> None:
    expected = run.chunks()

    assert run(FakeDeepSeek(answers(len(expected)))) == (len(expected), 0)

    entries = run.entries()
    assert sorted((entry["file"], entry["position"]) for entry in entries) == sorted(expected)
    assert {entry["file"] for entry in entries} == {"a.epub", "b.epub"}
    assert all(entry["prompt_version"] == PROMPT_VERSION for entry in entries)
    assert all(len(entry["descriptors"]) == CHUNK_DESCRIPTORS for entry in entries)
    assert len(run.shown) == len(expected)
    assert run.shown[-1].startswith(f"{len(expected)}/{len(expected)} ")


def test_the_requests_run_at_the_same_time(run: Run) -> None:
    """The first two requests wait for each other; one at a time, the first never returns."""
    barrier = threading.Barrier(2, timeout=5)
    order = itertools.count(1)
    lock = threading.Lock()

    def meet() -> None:
        with lock:
            n = next(order)
        if n <= 2:
            barrier.wait()

    total = len(run.chunks())
    assert run(FakeDeepSeek(answers(total), on_request=meet), workers=2) == (total, 0)


def test_no_more_requests_run_at_once_than_workers(run: Run) -> None:
    lock = threading.Lock()
    running = peak = 0

    def hold() -> None:
        nonlocal running, peak
        with lock:
            running += 1
            peak = max(peak, running)
        time.sleep(0.05)
        with lock:
            running -= 1

    total = len(run.chunks())
    assert total > 2
    run(FakeDeepSeek(answers(total), on_request=hold), workers=2)

    assert peak == 2


def test_more_workers_than_the_protocol_allows_is_refused(run: Run) -> None:
    fake = FakeDeepSeek([])

    with pytest.raises(ValueError, match=str(RUN_WORKERS)):
        run(fake, workers=RUN_WORKERS + 1)

    assert fake.calls == []


def test_a_second_run_asks_only_for_what_the_log_lacks(run: Run) -> None:
    total = len(run.chunks())
    assert run(FakeDeepSeek(answers(2)), limit=2) == (2, 0)

    fake = FakeDeepSeek(answers(total - 2))
    assert run(fake) == (total - 2, 0)
    assert len(fake.calls) == total - 2

    assert run(FakeDeepSeek([])) == (0, 0)
    identities = [(entry["file"], entry["position"]) for entry in run.entries()]
    assert len(identities) == len(set(identities)) == total


def test_a_failed_answer_is_logged_and_the_run_goes_on(run: Run) -> None:
    total = len(run.chunks())
    fake = FakeDeepSeek(["not json"] * JSON_ATTEMPTS + answers(total - 1))

    assert run(fake, workers=1) == (total - 1, 1)

    assert [entry["status"] for entry in run.entries()].count("failed") == 1


def test_a_bad_key_stops_the_run_and_keeps_what_arrived(run: Run) -> None:
    fake = FakeDeepSeek([CHUNK_ANSWER, api_error(401), *answers(10)])

    with pytest.raises(StopRunError):
        run(fake, workers=1)

    assert len(fake.calls) == 2
    assert [entry["status"] for entry in run.entries()] == ["ok"]


def test_an_answer_still_running_when_another_fails_is_logged(run: Run) -> None:
    """The first request to start is slow; the second gets the 401 and fails first."""
    order = itertools.count(1)
    lock = threading.Lock()

    def first_is_slow() -> None:
        with lock:
            n = next(order)
        if n == 1:
            time.sleep(0.3)

    fake = FakeDeepSeek([api_error(401), *answers(10)], on_request=first_is_slow)

    with pytest.raises(StopRunError):
        run(fake, workers=2)

    assert len(fake.calls) == 2
    assert [entry["status"] for entry in run.entries()] == ["ok"]


def test_a_book_that_is_not_indexed_is_refused_before_any_request(
    tmp_path: Path, session: Session, settings: Settings
) -> None:
    folder = tmp_path / "files"
    books = make_corpus(folder)
    load_corpus(session, books, folder, settings)
    fake = FakeDeepSeek([])
    run = Run(books, session, tmp_path / "descriptors.jsonl", [])

    with pytest.raises(CorpusError, match="a.epub: not indexed"):
        run(fake)

    assert fake.calls == []


@pytest.fixture(name="describe_args")
def describe_args_fixture(
    experiment_db: None, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> list[str]:
    """A loaded and indexed experiment database, a key, and the `rag describe` arguments."""
    folder = tmp_path / "files"
    books = make_corpus(folder)
    corpus_csv = write_csv(tmp_path / "corpus.csv", [dataclasses.asdict(b) for b in books])
    stats = tmp_path / "corpus-stats.csv"
    write_stats(book_stats(books, folder, words_as_tokens), stats)
    monkeypatch.setattr("rag.embeddings.load_model", lambda settings: FakeEmbedder())
    assert main(["rag", "load-corpus", str(corpus_csv), str(folder)]) == 0
    assert main(["rag", "index", str(corpus_csv), "--stats", str(stats)]) == 0
    monkeypatch.setenv(KEY_SETTING, "sk-test")
    get_settings.cache_clear()
    return ["rag", "describe", str(corpus_csv), "--out", str(tmp_path / "descriptors.jsonl")]


def test_the_command_shows_each_answer_and_a_summary(
    describe_args: list[str], capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = FakeDeepSeek(answers(2))
    monkeypatch.setattr("rag.deepseek.openai.OpenAI", lambda **kwargs: fake)

    assert main([*describe_args, "--limit", "2"]) == 0

    out = capsys.readouterr().out
    assert "1/2 " in out
    assert "2/2 " in out
    assert "2 ok, 0 failed in this run." in out


@pytest.mark.parametrize("workers", ["0", str(RUN_WORKERS + 1)])
def test_the_command_refuses_a_workers_count_out_of_range(
    workers: str,
    describe_args: list[str],
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = FakeDeepSeek([])
    monkeypatch.setattr("rag.deepseek.openai.OpenAI", lambda **kwargs: fake)

    assert main([*describe_args, "--workers", workers]) == 1

    assert f"workers must be from 1 to {RUN_WORKERS}" in capsys.readouterr().err
    assert fake.calls == []


def test_the_command_reports_a_failed_request_without_a_traceback(
    describe_args: list[str], capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = FakeDeepSeek([CHUNK_ANSWER, api_error(429)])
    monkeypatch.setattr("rag.deepseek.openai.OpenAI", lambda **kwargs: fake)

    assert main([*describe_args, "--workers", "1"]) == 1

    err = capsys.readouterr().err
    assert err.startswith("error: ")
    assert "429" in err


# --- the questions ------------------------------------------------------------------------


def describe_questions(
    records: list[HandRecord] | list[ReviewRecord], fake: FakeDeepSeek, out: Path, workers: int = 2
) -> tuple[int, int]:
    client = DeepSeek(Settings(deepseek_api_key=SecretStr("sk-test")), client=fake)
    return run_describe_questions(records, client, out, workers, lambda line: None)


def test_each_kept_question_gets_five_descriptors_from_the_question_prompt(
    tmp_path: Path,
) -> None:
    kept = hand_set(3)
    skipped = dataclasses.replace(
        hand_set(4)[3], status="skipped", question=None, kind=None, reason="too short"
    )
    fake = FakeDeepSeek([QUESTION_ANSWER] * 3)
    out = tmp_path / "query-descriptors.jsonl"

    assert describe_questions([*kept, skipped], fake, out) == (3, 0)

    entries = read_log(out)
    assert sorted(entry["id"] for entry in entries) == ["hand-001", "hand-002", "hand-003"]
    assert all(entry["kind"] == "question" for entry in entries)
    assert all(len(entry["descriptors"]) == QUESTION_DESCRIPTORS for entry in entries)
    assert {call["messages"][0]["content"] for call in fake.calls} == {QUESTION_PROMPT}
    assert sorted(call["messages"][1]["content"] for call in fake.calls) == sorted(
        record.question for record in kept
    )


def test_a_second_question_run_asks_for_nothing(tmp_path: Path) -> None:
    out = tmp_path / "query-descriptors.jsonl"
    describe_questions(hand_set(3), FakeDeepSeek([QUESTION_ANSWER] * 3), out)
    fake = FakeDeepSeek([])

    assert describe_questions(hand_set(3), fake, out) == (0, 0)

    assert fake.calls == []


@pytest.fixture(name="questions_args")
def questions_args_fixture(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> list[str]:
    monkeypatch.setenv(KEY_SETTING, "sk-test")
    get_settings.cache_clear()
    return [
        "rag",
        "describe-questions",
        "--hand",
        str(tmp_path / "hand.jsonl"),
        "--out",
        str(tmp_path / "query-descriptors.jsonl"),
    ]


def write_hand(path: Path, records: list[HandRecord]) -> None:
    lines = [json.dumps(dataclasses.asdict(record)) for record in records]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def test_the_question_command_waits_for_the_whole_hand_set(
    questions_args: list[str],
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    write_hand(tmp_path / "hand.jsonl", hand_set(HAND_SET_SIZE - 1))
    fake = FakeDeepSeek([])
    monkeypatch.setattr("rag.deepseek.openai.OpenAI", lambda **kwargs: fake)

    assert main(questions_args) == 1

    assert f"{HAND_SET_SIZE - 1} of {HAND_SET_SIZE}" in capsys.readouterr().err
    assert fake.calls == []


def test_the_question_command_describes_the_hand_set(
    questions_args: list[str],
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    write_hand(tmp_path / "hand.jsonl", hand_set(HAND_SET_SIZE))
    fake = FakeDeepSeek([QUESTION_ANSWER] * HAND_SET_SIZE)
    monkeypatch.setattr("rag.deepseek.openai.OpenAI", lambda **kwargs: fake)

    assert main(questions_args) == 0

    out = capsys.readouterr().out
    assert f"{HAND_SET_SIZE}/{HAND_SET_SIZE} hand-" in out
    assert f"{HAND_SET_SIZE} ok, 0 failed in this run." in out


def test_reviewed_drafts_are_described_when_kept_or_edited(tmp_path: Path) -> None:
    def reviewed(n: int, status: str) -> ReviewRecord:
        used = status != "dropped"
        return ReviewRecord(
            id=f"draft-{n:03d}",
            status=status,
            file=f"{n}.epub",
            book_sha256=f"{n:064x}",
            genre="fiction",
            position=0,
            chunker_version=1,
            question=f"Draft question {n}?" if used else None,
            kind="factual" if used else None,
            draft_question=f"Draft question {n}?",
            draft_kind="factual",
            reason=None if used else "a reason",
            reviewed_at="2026-11-25",
        )

    records = [reviewed(1, "kept"), reviewed(2, "edited"), reviewed(3, "dropped")]
    out = tmp_path / "query-descriptors.jsonl"

    assert describe_questions(records, FakeDeepSeek([QUESTION_ANSWER] * 2), out) == (2, 0)

    assert sorted(entry["id"] for entry in read_log(out)) == ["draft-001", "draft-002"]
