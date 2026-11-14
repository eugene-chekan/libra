"""The hand-question session: which chunk it shows, what it records, how it resumes."""

import csv
import dataclasses
import io
import json
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.cli import main
from rag.chunking import CHUNKER_VERSION, SHORT_CHUNK_WORDS, TextChunk, chunk_book
from rag.corpus import (
    STATS_FIELDS,
    CorpusBook,
    CorpusError,
    book_stats,
    frozen_chunks,
    read_digests,
    write_stats,
)
from rag.questions import (
    HAND_SET_SIZE,
    KIND_PROMPT,
    QUESTION_PROMPT,
    HandRecord,
    pick_chunk,
    read_records,
    run_session,
)
from tests.corpus_helpers import chapters_book, row, words_as_tokens, write_csv
from tests.epub_factory import Chapter, build_epub

TODAY = date(2026, 10, 19)


@dataclass
class Corpus:
    books: list[CorpusBook]
    folder: Path
    digests: dict[str, str]

    def book(self, file: str) -> CorpusBook:
        return next(book for book in self.books if book.file == file)

    def chunks(self, file: str) -> list[TextChunk]:
        return frozen_chunks(self.folder / file, file, words_as_tokens, self.digests)


@pytest.fixture(name="corpus")
def corpus_fixture(tmp_path: Path) -> Corpus:
    """Two test books and a pilot book, with their digests read back from a stats file."""
    folder = tmp_path / "files"
    sizes = [150, 50, 150, 150, 150, 50, 150]
    books = [
        CorpusBook(**{**row(chapters_book(folder, "a.epub", sizes)), "title": "The First Book"}),
        CorpusBook(
            **{
                **row(chapters_book(folder, "b.epub", sizes), genre="non-fiction"),
                "title": "The Second Book",
            }
        ),
        CorpusBook(**row(chapters_book(folder, "p.epub", sizes), role="pilot")),
    ]
    stats = tmp_path / "corpus-stats.csv"
    write_stats(book_stats(books, folder, words_as_tokens), stats)
    return Corpus(books, folder, read_digests(stats))


class Script:
    """Answers the session's prompts in order, and keeps the prompts it was asked."""

    def __init__(self, answers: list[str]) -> None:
        self.answers = list(answers)
        self.prompts: list[str] = []

    def __call__(self, prompt: str) -> str:
        self.prompts.append(prompt)
        return self.answers.pop(0)


def session(
    corpus: Corpus,
    out: Path,
    ask: Callable[[str], str],
    screens: list[str] | None = None,
) -> int:
    show = screens.append if screens is not None else lambda text: None
    return run_session(
        corpus.books, corpus.folder, corpus.digests, words_as_tokens, out, ask, show, TODAY
    )


def test_the_pick_skips_short_chunks_and_is_repeatable(corpus: Corpus) -> None:
    book, chunks = corpus.book("a.epub"), corpus.chunks("a.epub")

    picks = [pick_chunk(book, chunks, attempt) for attempt in range(10)]

    assert {chunk.position for chunk in picks} == {0, 2, 3, 4, 6}
    assert all(chunk.word_count >= SHORT_CHUNK_WORDS for chunk in picks)
    assert [pick_chunk(book, list(chunks), attempt) for attempt in range(10)] == picks


def test_another_attempt_picks_another_chunk(tmp_path: Path) -> None:
    path = chapters_book(tmp_path, "long.epub", [150] * 10)
    book = CorpusBook(**row(path))
    chunks = chunk_book(path, words_as_tokens)

    positions = [pick_chunk(book, chunks, attempt).position for attempt in range(10)]

    assert sorted(positions) == list(range(10))


def test_a_session_keeps_one_question_per_test_book(corpus: Corpus, tmp_path: Path) -> None:
    out = tmp_path / "hand.jsonl"

    kept = session(corpus, out, Script(["Q1?", "f", "Q2?", "i"]))

    records = read_records(out)
    assert kept == 2
    assert [r.file for r in records] == ["a.epub", "b.epub"]
    assert [r.id for r in records] == ["hand-001", "hand-002"]
    assert [r.status for r in records] == ["kept", "kept"]
    assert [r.question for r in records] == ["Q1?", "Q2?"]
    assert [r.kind for r in records] == ["factual", "interpretive"]
    assert [r.position for r in records] == [
        pick_chunk(corpus.book(file), corpus.chunks(file), 0).position
        for file in ("a.epub", "b.epub")
    ]


def test_a_skip_records_the_reason_and_draws_again(corpus: Corpus, tmp_path: Path) -> None:
    out = tmp_path / "hand.jsonl"

    session(corpus, out, Script(["s", "too short to ask about", "Q?", "f", "q"]))

    skipped, kept = read_records(out)
    book, chunks = corpus.book("a.epub"), corpus.chunks("a.epub")
    assert (skipped.status, skipped.attempt, skipped.reason) == (
        "skipped",
        0,
        "too short to ask about",
    )
    assert (skipped.question, skipped.kind) == (None, None)
    assert skipped.position == pick_chunk(book, chunks, 0).position
    assert (kept.status, kept.attempt, kept.question) == ("kept", 1, "Q?")
    assert kept.position == pick_chunk(book, chunks, 1).position
    assert kept.position != skipped.position


def test_a_kind_is_asked_until_it_is_f_or_i(corpus: Corpus, tmp_path: Path) -> None:
    out = tmp_path / "hand.jsonl"
    script = Script(["Q?", "x", "", "i", "q"])

    session(corpus, out, script)

    [record] = read_records(out)
    assert record.kind == "interpretive"
    assert script.prompts.count(KIND_PROMPT) == 3


def test_an_empty_question_or_reason_is_asked_again(corpus: Corpus, tmp_path: Path) -> None:
    out = tmp_path / "hand.jsonl"
    script = Script(["", "  ", "Q?", "f", "s", "", "no question fits", "q"])

    session(corpus, out, script)

    kept, skipped = read_records(out)
    assert kept.question == "Q?"
    assert skipped.reason == "no question fits"
    assert script.prompts.count(QUESTION_PROMPT) == 5


def test_quitting_stops_and_writes_nothing_more(corpus: Corpus, tmp_path: Path) -> None:
    out = tmp_path / "hand.jsonl"

    assert session(corpus, out, Script(["q"])) == 0
    assert read_records(out) == []


def test_an_interrupted_session_loses_nothing_and_resumes(corpus: Corpus, tmp_path: Path) -> None:
    out = tmp_path / "hand.jsonl"
    answers = ["Q1?", "f"]
    on_disk: list[str] = []

    def ask_then_stop(prompt: str) -> str:
        if answers:
            return answers.pop(0)
        on_disk.append(out.read_text(encoding="utf-8"))
        raise KeyboardInterrupt

    first: list[str] = []
    with pytest.raises(KeyboardInterrupt):
        session(corpus, out, ask_then_stop, first)

    [line] = on_disk[0].splitlines()
    assert json.loads(line)["question"] == "Q1?"
    second: list[str] = []
    session(corpus, out, Script(["Q2?", "i"]), second)
    assert second[0] == first[-1]
    assert [r.question for r in read_records(out)] == ["Q1?", "Q2?"]


@pytest.mark.parametrize(
    "digests, words",
    [({"a.epub": "0" * 64}, "tokenizer"), ({}, f"chunker version {CHUNKER_VERSION}")],
    ids=["a different digest", "no digest"],
)
def test_a_tokenizer_change_is_refused_before_any_prompt(
    corpus: Corpus, tmp_path: Path, digests: dict[str, str], words: str
) -> None:
    corpus.digests = digests
    script = Script([])

    with pytest.raises(CorpusError) as caught:
        session(corpus, tmp_path / "hand.jsonl", script)

    assert "a.epub" in str(caught.value)
    assert words in str(caught.value)
    assert script.prompts == []


def test_every_record_carries_the_chunk_identity(corpus: Corpus, tmp_path: Path) -> None:
    out = tmp_path / "hand.jsonl"

    session(corpus, out, Script(["Q?", "f", "q"]))

    [record] = read_records(out)
    book = corpus.book("a.epub")
    assert record.book_sha256 == book.sha256
    assert record.genre == "fiction"
    assert record.position == pick_chunk(book, corpus.chunks("a.epub"), 0).position
    assert record.chunker_version == CHUNKER_VERSION
    assert record.chunks_sha256 == corpus.digests["a.epub"]
    assert record.written_at == "2026-10-19"


def test_the_screen_shows_the_book_and_the_chunk(corpus: Corpus, tmp_path: Path) -> None:
    screens: list[str] = []

    session(corpus, tmp_path / "hand.jsonl", Script(["Q?", "f", "q"]), screens)

    second = screens[1]
    chunk = pick_chunk(corpus.book("b.epub"), corpus.chunks("b.epub"), 0)
    assert f"1/{HAND_SET_SIZE}" in second
    assert "1 factual" in second
    assert "0 interpretive" in second
    assert "non-fiction" in second
    assert "The Second Book" in second
    assert chunk.chapter_title in second
    assert chunk.text in second


def test_a_broken_line_in_the_file_is_named(tmp_path: Path) -> None:
    out = tmp_path / "hand.jsonl"
    out.write_text('{"id": "hand-001"}\n', encoding="utf-8")

    with pytest.raises(CorpusError, match="line 1"):
        read_records(out)


def test_a_stats_file_without_digests_is_refused(tmp_path: Path) -> None:
    stats = tmp_path / "corpus-stats.csv"
    with stats.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle, fieldnames=[f for f in STATS_FIELDS if f != "chunks_sha256"]
        )
        writer.writeheader()

    with pytest.raises(CorpusError, match="chunks_sha256"):
        read_digests(stats)


def test_a_record_is_one_json_line_in_plain_utf8(corpus: Corpus, tmp_path: Path) -> None:
    out = tmp_path / "hand.jsonl"

    session(corpus, out, Script(["Why does Zoë leave?", "i", "q"]))

    raw = out.read_bytes()
    assert raw.endswith(b"\n")
    assert b"\r\n" not in raw
    assert "Zoë".encode() in raw
    assert HandRecord(**json.loads(raw)).question == "Why does Zoë leave?"


@pytest.fixture(name="command_files")
def command_files_fixture(
    corpus: Corpus, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> list[str]:
    """The arguments of `rag hand-question` over the corpus fixture, with a fake model."""
    corpus_csv = write_csv(
        tmp_path / "corpus.csv", [dataclasses.asdict(book) for book in corpus.books]
    )
    fake_model = SimpleNamespace(token_count=words_as_tokens)
    monkeypatch.setattr("rag.embeddings.load_model", lambda settings: fake_model)
    return [
        "rag",
        "hand-question",
        str(corpus_csv),
        str(corpus.folder),
        "--stats",
        str(tmp_path / "corpus-stats.csv"),
        "--out",
        str(tmp_path / "questions" / "hand.jsonl"),
    ]


def test_hand_question_command_runs_a_session(
    corpus: Corpus,
    command_files: list[str],
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr("builtins.input", Script(["Q?", "f", "q"]))

    assert main(command_files) == 0

    [record] = read_records(tmp_path / "questions" / "hand.jsonl")
    assert (record.file, record.status, record.question) == ("a.epub", "kept", "Q?")
    chunk = pick_chunk(corpus.book("a.epub"), corpus.chunks("a.epub"), 0)
    assert chunk.text in capsys.readouterr().out


def test_hand_question_command_names_a_refused_book(
    command_files: list[str],
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    stats = tmp_path / "corpus-stats.csv"
    with stats.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    rows[0]["chunks_sha256"] = "0" * 64
    with stats.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=STATS_FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    script = Script([])
    monkeypatch.setattr("builtins.input", script)

    assert main(command_files) == 1

    assert "error: a.epub" in capsys.readouterr().err
    assert script.prompts == []


@pytest.mark.parametrize("stop", [KeyboardInterrupt, EOFError], ids=["Ctrl-C", "end of input"])
def test_hand_question_command_stops_cleanly(
    command_files: list[str],
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    stop: type[BaseException],
) -> None:
    answers = ["Q?", "f"]

    def ask_then_stop(prompt: str) -> str:
        if answers:
            return answers.pop(0)
        raise stop

    monkeypatch.setattr("builtins.input", ask_then_stop)

    assert main(command_files) == 0

    assert "saved" in capsys.readouterr().out
    assert len(read_records(tmp_path / "questions" / "hand.jsonl")) == 1


def test_hand_question_command_refuses_a_changed_file(
    corpus: Corpus,
    command_files: list[str],
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    path = corpus.folder / "b.epub"
    path.write_bytes(path.read_bytes() + b"x")
    script = Script([])
    monkeypatch.setattr("builtins.input", script)

    assert main(command_files) == 1

    assert "b.epub: its sha256 differs" in capsys.readouterr().err
    assert script.prompts == []


def test_the_command_prints_a_chunk_the_code_page_cannot_hold(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    folder = tmp_path / "files"
    # Standard Ebooks puts a zero-width no-break space before many dashes.
    text = " ".join(["houri﻿—a"] * SHORT_CHUNK_WORDS)
    path = build_epub(
        folder / "a.epub", titles=["a"], chapters=[Chapter("c.xhtml", f"<p>{text}</p>")]
    )
    corpus_csv = write_csv(tmp_path / "corpus.csv", [row(path)])
    stats = tmp_path / "corpus-stats.csv"
    write_stats(book_stats([CorpusBook(**row(path))], folder, words_as_tokens), stats)
    fake_model = SimpleNamespace(token_count=words_as_tokens)
    monkeypatch.setattr("rag.embeddings.load_model", lambda settings: fake_model)
    monkeypatch.setattr("builtins.input", Script(["q"]))
    raw = io.BytesIO()
    console = io.TextIOWrapper(raw, encoding="cp1252")
    monkeypatch.setattr("sys.stdout", console)
    out = tmp_path / "hand.jsonl"

    code = main(
        ["rag", "hand-question", str(corpus_csv), str(folder), "--stats", str(stats)]
        + ["--out", str(out)]
    )

    console.flush()
    assert code == 0
    assert "houri?—a".encode("cp1252") in raw.getvalue()


KEPT = HandRecord(
    id="hand-001",
    status="kept",
    file="a.epub",
    book_sha256="0" * 64,
    genre="fiction",
    position=0,
    chunker_version=CHUNKER_VERSION,
    chunks_sha256="1" * 64,
    attempt=0,
    question="Q?",
    kind="factual",
    reason=None,
    written_at="2026-10-19",
)
SKIPPED = dataclasses.replace(
    KEPT, id="hand-002", status="skipped", question=None, kind=None, reason="no fact"
)


def write_records(path: Path, records: list[HandRecord], *, final_newline: bool = True) -> Path:
    text = "\n".join(json.dumps(dataclasses.asdict(record)) for record in records)
    path.write_text(text + ("\n" if final_newline else ""), encoding="utf-8")
    return path


@pytest.mark.parametrize("saved", ["", '{"id": "hand-001", '], ids=["an old copy", "a broken line"])
def test_a_file_changed_by_an_editor_stops_the_session_before_it_writes(
    corpus: Corpus, tmp_path: Path, saved: str
) -> None:
    out = tmp_path / "hand.jsonl"
    answers = ["Qa?", "f", "Qb?", "i"]

    def ask(prompt: str) -> str:
        if len(answers) == 2:
            # An editor opened the file before the first answer, and saves now.
            out.write_text(saved, encoding="utf-8")
        return answers.pop(0)

    with pytest.raises(CorpusError, match="changed while this session was open") as caught:
        session(corpus, out, ask)

    assert out.read_text(encoding="utf-8") == saved
    assert "Qa?" in str(caught.value)
    assert "Qb?" in str(caught.value)


def test_a_second_session_stops_the_first_before_it_writes(corpus: Corpus, tmp_path: Path) -> None:
    out = tmp_path / "hand.jsonl"
    answers = ["Qa?", "f"]

    def ask(prompt: str) -> str:
        if len(answers) == 2:
            # Another session, opened later, answers the same book first.
            session(corpus, out, Script(["Other?", "i", "q"]))
        return answers.pop(0)

    with pytest.raises(CorpusError, match="changed while this session was open") as caught:
        session(corpus, out, ask)

    assert [r.question for r in read_records(out)] == ["Other?"]
    assert "Qa?" in str(caught.value)


def test_the_next_id_follows_the_largest_one(corpus: Corpus, tmp_path: Path) -> None:
    out = tmp_path / "hand.jsonl"
    session(corpus, out, Script(["s", "no fact", "Qa?", "f", "Qb?", "i"]))
    skip, kept_a, kept_b = read_records(out)
    write_records(out, [skip, kept_b])

    session(corpus, out, Script(["Qa again?", "f"]))

    records = read_records(out)
    assert [r.id for r in records] == ["hand-001", "hand-003", "hand-004"]
    assert records[-1].question == "Qa again?"
    assert records[-1].position == kept_a.position
    assert records[-1].attempt == 1


@pytest.mark.parametrize(
    "records, line",
    [
        ([dataclasses.replace(KEPT, status="Kept")], 1),
        ([dataclasses.replace(KEPT, kind="interpretative")], 1),
        ([dataclasses.replace(KEPT, question=" ")], 1),
        ([dataclasses.replace(SKIPPED, reason="")], 1),
        ([dataclasses.replace(KEPT, id="7")], 1),
        ([KEPT, dataclasses.replace(SKIPPED, id="hand-001")], 2),
        ([KEPT, dataclasses.replace(KEPT, id="hand-002")], 2),
    ],
    ids=[
        "a status not kept or skipped",
        "a kind not factual or interpretive",
        "an empty question",
        "a skip without a reason",
        "an id not hand-NNN",
        "an id used twice",
        "a second kept question for a book",
    ],
)
def test_a_record_with_a_wrong_value_is_named(
    tmp_path: Path, records: list[HandRecord], line: int
) -> None:
    out = write_records(tmp_path / "hand.jsonl", records)

    with pytest.raises(CorpusError, match=f"line {line}"):
        read_records(out)


def test_a_file_without_a_final_newline_gets_one_before_the_next_record(
    corpus: Corpus, tmp_path: Path
) -> None:
    out = write_records(tmp_path / "hand.jsonl", [KEPT], final_newline=False)

    session(corpus, out, Script(["Q?", "f", "q"]))

    assert [r.id for r in read_records(out)] == ["hand-001", "hand-002"]
