"""`rag review`: the author keeps, edits or drops each drafted question."""

import dataclasses
import json
from collections.abc import Callable, Iterator
from datetime import date
from pathlib import Path

import pytest
from sqlmodel import Session

from app.cli import main
from rag.chunking import CHUNKER_VERSION
from rag.corpus import CorpusBook, CorpusError, book_stats, write_stats
from rag.descriptors import append_log
from rag.drafts import DRAFT_PROMPT_VERSION, pick_chunks
from rag.review import (
    ACTION_PROMPT,
    DROP_PROMPT,
    DROP_REASONS,
    EDIT_PROMPT,
    ReviewRecord,
    read_reviews,
    run_review,
)
from tests.corpus_helpers import words_as_tokens, write_csv
from tests.fake_embedder import FakeEmbedder
from tests.test_rag_drafts import corpus_fixture  # noqa: F401

TODAY = date(2026, 11, 23)


def draft_entries(session: Session, books: list[CorpusBook], count: int = 3) -> list[dict]:
    """Logged drafts for the first picked chunks, as `rag draft-questions` writes them."""
    return [
        {
            "id": picked.id,
            "file": picked.book.file,
            "book_sha256": picked.book.sha256,
            "genre": picked.book.genre,
            "position": picked.chunk.position,
            "chunker_version": CHUNKER_VERSION,
            "kind": picked.kind,
            "prompt_version": DRAFT_PROMPT_VERSION,
            "status": "ok",
            "question": f"Question {picked.id}?",
            "answer": f"answer {picked.id}",
            "evidence": f"evidence {picked.id}",
        }
        for picked in pick_chunks(session, books, [])[:count]
    ]


def script(*answers: str) -> Callable[[str], str]:
    """An `ask` that types the answers in order, and records each prompt it was given."""
    typed: Iterator[str] = iter(answers)

    def ask(prompt: str) -> str:
        ask.prompts.append(prompt)  # type: ignore[attr-defined]
        return next(typed)

    ask.prompts = []  # type: ignore[attr-defined]
    return ask


@dataclasses.dataclass
class Desk:
    session: Session
    books: list[CorpusBook]
    drafts: list[dict]
    drafts_log: Path
    out: Path
    shown: list[str]

    def run(self, *answers: str) -> int:
        self.ask = script(*answers)
        return run_review(
            self.session, self.books, self.drafts_log, self.out, self.ask, self.shown.append, TODAY
        )

    def records(self) -> list[ReviewRecord]:
        return read_reviews(self.out)


@pytest.fixture(name="desk")
def desk_fixture(session: Session, corpus: list[CorpusBook], tmp_path: Path) -> Desk:
    drafts = draft_entries(session, corpus)
    log = tmp_path / "drafts.jsonl"
    for draft in drafts:
        append_log(log, draft)
    return Desk(session, corpus, drafts, log, tmp_path / "review.jsonl", [])


def test_a_kept_draft_is_recorded_with_its_question_and_kind(desk: Desk) -> None:
    assert desk.run("k", "q") == 1

    (record,) = desk.records()
    first = desk.drafts[0]
    assert (record.id, record.status, record.question, record.kind) == (
        first["id"],
        "kept",
        first["question"],
        first["kind"],
    )
    assert record.reviewed_at == TODAY.isoformat()


def test_the_screen_shows_the_chunk_and_the_whole_draft(
    desk: Desk, session: Session, corpus: list[CorpusBook]
) -> None:
    desk.run("q")

    picked = pick_chunks(session, corpus, [])[0]
    screen = desk.shown[0]
    first = desk.drafts[0]
    assert picked.chunk.text in screen
    assert first["question"] in screen
    assert first["answer"] in screen
    assert first["evidence"] in screen


def test_an_edit_keeps_the_kind_on_enter_and_changes_it_on_a_key(desk: Desk) -> None:
    desk.run("e", "What did they find?", "", "e", "Why did they leave?", "i", "q")

    first, second = desk.records()
    assert (first.status, first.question, first.kind) == (
        "edited",
        "What did they find?",
        desk.drafts[0]["kind"],
    )
    assert first.draft_question == desk.drafts[0]["question"]
    assert (second.question, second.kind) == ("Why did they leave?", "interpretive")


def test_an_edited_question_that_copies_the_chunk_is_asked_for_again(
    desk: Desk, session: Session, corpus: list[CorpusBook]
) -> None:
    chunk = pick_chunks(session, corpus, [])[0].chunk.text
    copy = " ".join(chunk.split()[:4])

    desk.run("e", f"Why {copy}?", "Why did it happen?", "", "q")

    (record,) = desk.records()
    assert record.question == "Why did it happen?"
    assert any("repeats words of the chunk" in screen for screen in desk.shown)
    assert desk.ask.prompts.count(EDIT_PROMPT) == 2


def test_a_drop_by_number_records_the_rule_and_typed_text_is_kept(desk: Desk) -> None:
    desk.run("d", "3", "d", "the evidence is from another chunk", "q")

    first, second = desk.records()
    assert (first.status, first.question, first.reason) == ("dropped", None, DROP_REASONS["3"])
    assert second.reason == "the evidence is from another chunk"
    assert desk.ask.prompts.count(DROP_PROMPT) == 2


def test_an_unknown_action_is_asked_for_again(desk: Desk) -> None:
    desk.run("x", "", "k", "q")

    assert desk.ask.prompts[:3] == [ACTION_PROMPT] * 3
    assert len(desk.records()) == 1


def test_the_review_resumes_at_the_first_draft_not_reviewed(desk: Desk) -> None:
    desk.run("k", "q")

    assert desk.run("d", "1", "k") == 2

    assert [record.id for record in desk.records()] == [d["id"] for d in desk.drafts]
    assert desk.shown[-1] == f"All {len(desk.drafts)} drafts are reviewed."


def test_failed_drafts_and_other_prompt_versions_are_not_shown(desk: Desk) -> None:
    lines = desk.drafts_log.read_text(encoding="utf-8").splitlines()
    first, second = json.loads(lines[0]), json.loads(lines[1])
    first["status"] = "failed"
    second["prompt_version"] = "d0"
    desk.drafts_log.write_text(
        "\n".join([json.dumps(first), json.dumps(second), *lines[2:]]) + "\n", encoding="utf-8"
    )

    assert desk.run("k") == 1

    assert [record.id for record in desk.records()] == [desk.drafts[2]["id"]]


def test_a_file_changed_during_the_review_stops_it_before_writing(desk: Desk) -> None:
    desk.run("k", "q")

    def edit_meanwhile(prompt: str) -> str:
        desk.out.write_text("", encoding="utf-8")
        return "k"

    with pytest.raises(CorpusError, match="changed while this session was open"):
        run_review(
            desk.session, desk.books, desk.drafts_log, desk.out, edit_meanwhile, print, TODAY
        )

    assert desk.records() == []


@pytest.mark.parametrize(
    ("change", "problem"),
    [
        ({"status": "maybe"}, "the status"),
        ({"status": "dropped", "reason": None}, "the drop has no reason"),
        ({"question": " "}, "the question is empty"),
        ({"kind": "x"}, "the kind"),
    ],
)
def test_a_review_line_that_breaks_a_rule_is_named(desk: Desk, change: dict, problem: str) -> None:
    desk.run("k", "q")
    record = {**dataclasses.asdict(desk.records()[0]), **change}
    desk.out.write_text(json.dumps(record) + "\n", encoding="utf-8")

    with pytest.raises(CorpusError, match=f"review.jsonl line 1: {problem}"):
        read_reviews(desk.out)


def test_a_draft_reviewed_twice_is_named(desk: Desk) -> None:
    desk.run("k", "q")
    line = desk.out.read_text(encoding="utf-8")
    desk.out.write_text(line + line, encoding="utf-8")

    with pytest.raises(CorpusError, match="reviewed twice"):
        read_reviews(desk.out)


def test_the_command_reviews_and_saves(
    experiment_db: None,
    corpus: list[CorpusBook],
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    folder = tmp_path / "files"
    corpus_csv = write_csv(tmp_path / "corpus.csv", [dataclasses.asdict(b) for b in corpus])
    stats = tmp_path / "corpus-stats.csv"
    write_stats(book_stats(corpus, folder, words_as_tokens), stats)
    monkeypatch.setattr("rag.embeddings.load_model", lambda settings: FakeEmbedder())
    assert main(["rag", "load-corpus", str(corpus_csv), str(folder)]) == 0
    assert main(["rag", "index", str(corpus_csv), "--stats", str(stats)]) == 0
    drafts = tmp_path / "command-drafts.jsonl"
    from app.db import get_engine

    with Session(get_engine()) as session:
        for draft in draft_entries(session, corpus, count=2):
            append_log(drafts, draft)
    out = tmp_path / "command-review.jsonl"
    monkeypatch.setattr("builtins.input", script("k", "d", "2"))

    assert main(["rag", "review", str(corpus_csv), "--drafts", str(drafts), "--out", str(out)]) == 0

    assert "Reviewed 2 draft(s) in this session." in capsys.readouterr().out
    assert [record.status for record in read_reviews(out)] == ["kept", "dropped"]
