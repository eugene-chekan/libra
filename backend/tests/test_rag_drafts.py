"""Drafting test questions: the chunks, the prompts, the 4-word check, and the run."""

import dataclasses
import json
from pathlib import Path

import pytest
from pydantic import SecretStr
from sqlmodel import Session

from app.config import Settings
from rag.chunking import SHORT_CHUNK_WORDS
from rag.corpus import CorpusBook, book_stats, load_corpus
from rag.deepseek import JSON_ATTEMPTS, DeepSeek
from rag.descriptors import read_log
from rag.drafts import (
    COPIED_WORDS,
    DRAFT_PROMPTS,
    DRAFT_ROUNDS,
    PARTS_PER_BOOK,
    copied_sequences,
    draft_one,
    parse_draft,
    pick_chunks,
    run_drafts,
)
from rag.index import index_books, indexed_chunks
from rag.questions import QUESTION_KINDS
from tests.corpus_helpers import chapters_book, row, words_as_tokens
from tests.fake_deepseek import FakeDeepSeek
from tests.fake_embedder import FakeEmbedder
from tests.test_rag_evaluate import hand_record

# 30 chapters, one chunk each; every sixth is short and is never picked.
SIZES = ([150] * 5 + [SHORT_CHUNK_WORDS - 1]) * 5


def draft_answer(kind: str = "factual", question: str = "Who sailed away?") -> str:
    return json.dumps(
        {"question": question, "kind": kind, "answer": "the captain", "evidence": "he sailed"}
    )


@pytest.fixture(name="corpus")
def corpus_fixture(tmp_path: Path, session: Session, settings: Settings) -> list[CorpusBook]:
    folder = tmp_path / "files"
    books = [
        CorpusBook(**row(chapters_book(folder, "a.epub", SIZES))),
        CorpusBook(**row(chapters_book(folder, "b.epub", SIZES), genre="non-fiction")),
        CorpusBook(**row(chapters_book(folder, "p.epub", SIZES), role="pilot")),
    ]
    digests = {s.book.file: s.chunks_sha256 for s in book_stats(books, folder, words_as_tokens)}
    load_corpus(session, books, folder, settings)
    index_books(session, books, digests, settings, FakeEmbedder())
    return books


def client(fake: FakeDeepSeek) -> DeepSeek:
    return DeepSeek(Settings(deepseek_api_key=SecretStr("sk-test")), client=fake)


# --- the 4-word check -----------------------------------------------------------------------


def test_a_question_that_repeats_four_words_of_the_chunk_is_caught() -> None:
    chunk = "The old man walked slowly to the harbour every morning."

    assert copied_sequences("Why did he walk slowly to the harbour?", chunk) == [
        "slowly to the harbour"
    ]


def test_three_shared_words_are_not_a_copy() -> None:
    chunk = "The old man walked slowly to the harbour every morning."

    assert copied_sequences("Where did he go slowly to sea?", chunk) == []


def test_a_sequence_with_a_name_in_it_does_not_count() -> None:
    """ "Captain Brand" has capitals inside a sentence, so both words are names."""
    chunk = "At dawn the men saw Captain Brand walk to the harbour."

    assert copied_sequences("Where did Captain Brand walk to?", chunk) == []
    # The same chunk without a name in the shared words is a copy.
    assert copied_sequences("Did Captain Brand walk to the harbour?", chunk) == [
        "walk to the harbour"
    ]


def test_the_first_word_of_a_sentence_is_not_a_name() -> None:
    chunk = "Then the ship came back to port. Everyone was glad of it."

    assert copied_sequences("Why was it that everyone was glad of it?", chunk) == [
        "everyone was glad of",
        "was glad of it",
    ]


def test_the_check_ignores_case_and_punctuation() -> None:
    chunk = "“Leave the city now,” he said."

    assert copied_sequences("Why must they leave the city now?", chunk) == ["leave the city now"]


# --- the prompts and the answer's shape -----------------------------------------------------


@pytest.mark.parametrize("kind", QUESTION_KINDS)
def test_each_prompt_asks_for_its_kind_in_json(kind: str) -> None:
    prompt = DRAFT_PROMPTS[kind]
    form = json.loads(prompt[prompt.index("{") : prompt.index("}") + 1])

    assert form == {"question": "...", "kind": kind, "answer": "...", "evidence": "..."}
    assert "json" in prompt


def test_a_draft_of_the_right_shape_is_accepted() -> None:
    assert parse_draft(json.loads(draft_answer("interpretive")), "interpretive") == {
        "question": "Who sailed away?",
        "kind": "interpretive",
        "answer": "the captain",
        "evidence": "he sailed",
    }


@pytest.mark.parametrize(
    "change",
    [
        {"question": ""},
        {"answer": None},
        {"evidence": 3},
        {"question": "Who sailed"},
        {"kind": "x"},
    ],
    ids=["no question", "no answer", "no evidence", "no question mark", "another kind"],
)
def test_a_draft_of_another_shape_is_refused(change: dict) -> None:
    data = {**json.loads(draft_answer()), **change}

    with pytest.raises(ValueError):
        parse_draft(data, "factual")


# --- the chunks ------------------------------------------------------------------------------


def test_ten_chunks_from_each_test_book_one_from_each_tenth(
    session: Session, corpus: list[CorpusBook]
) -> None:
    picked = pick_chunks(session, corpus, [])

    assert {p.book.file for p in picked} == {"a.epub", "b.epub"}
    for book in corpus[:2]:
        mine = [p for p in picked if p.book.file == book.file]
        count = len(indexed_chunks(session, book))
        assert len(mine) == PARTS_PER_BOOK
        parts = [p.chunk.position * PARTS_PER_BOOK // count for p in mine]
        assert sorted(parts) == list(range(PARTS_PER_BOOK))
        kinds = [p.kind for p in mine]
        assert sorted(kinds) == sorted(QUESTION_KINDS * (PARTS_PER_BOOK // 2))
    assert all(p.chunk.word_count >= SHORT_CHUNK_WORDS for p in picked)
    assert [p.id for p in picked] == [f"draft-{n:03d}" for n in range(1, len(picked) + 1)]


def test_the_same_chunks_are_picked_every_time(session: Session, corpus: list[CorpusBook]) -> None:
    first = [
        (p.id, p.book.file, p.chunk.position, p.kind) for p in pick_chunks(session, corpus, [])
    ]
    again = [
        (p.id, p.book.file, p.chunk.position, p.kind) for p in pick_chunks(session, corpus, [])
    ]

    assert first == again


def test_a_hand_set_source_chunk_is_never_picked(
    session: Session, corpus: list[CorpusBook]
) -> None:
    taken = pick_chunks(session, corpus, [])[0]
    record = hand_record(taken.book, taken.chunk.position, 1)

    picked = pick_chunks(session, corpus, [record])

    assert (taken.book.file, taken.chunk.position) not in {
        (p.book.file, p.chunk.position) for p in picked
    }


# --- one draft --------------------------------------------------------------------------------


def test_a_draft_that_does_not_copy_is_kept_after_one_request(
    session: Session, corpus: list[CorpusBook]
) -> None:
    picked = pick_chunks(session, corpus, [])[0]
    fake = FakeDeepSeek([draft_answer(picked.kind)])

    entry = draft_one(client(fake), picked)

    assert entry["status"] == "ok"
    assert entry["question"] == "Who sailed away?"
    assert len(entry["rounds"]) == 1
    (call,) = fake.calls
    assert call["messages"] == [
        {"role": "system", "content": DRAFT_PROMPTS[picked.kind]},
        {"role": "user", "content": picked.chunk.text},
    ]


def test_a_copied_question_is_drafted_again_with_a_note_naming_the_words(
    session: Session, corpus: list[CorpusBook]
) -> None:
    picked = pick_chunks(session, corpus, [])[0]
    copy = " ".join(picked.chunk.text.split()[:COPIED_WORDS]).lower()
    fake = FakeDeepSeek([draft_answer(picked.kind, f"Why {copy}?"), draft_answer(picked.kind)])

    entry = draft_one(client(fake), picked)

    assert entry["status"] == "ok"
    assert [r["copied"] for r in entry["rounds"]] == [[copy], []]
    retry = fake.calls[1]["messages"][1]["content"]
    assert retry.startswith(picked.chunk.text)
    assert copy in retry.removeprefix(picked.chunk.text)


def test_a_question_that_copies_in_every_round_fails(
    session: Session, corpus: list[CorpusBook]
) -> None:
    picked = pick_chunks(session, corpus, [])[0]
    copy = " ".join(picked.chunk.text.split()[:COPIED_WORDS])
    fake = FakeDeepSeek([draft_answer(picked.kind, f"Why {copy}?")] * DRAFT_ROUNDS)

    entry = draft_one(client(fake), picked)

    assert entry["status"] == "failed"
    assert entry["question"] is None
    assert len(entry["rounds"]) == DRAFT_ROUNDS
    assert len(fake.calls) == DRAFT_ROUNDS


def test_an_answer_of_the_wrong_shape_fails_after_the_json_retries(
    session: Session, corpus: list[CorpusBook]
) -> None:
    picked = pick_chunks(session, corpus, [])[0]
    fake = FakeDeepSeek(["not json"] * JSON_ATTEMPTS)

    entry = draft_one(client(fake), picked)

    assert entry["status"] == "failed"
    assert "not JSON" in entry["error"]
    assert entry["prompt_tokens"] > 0


# --- the run ----------------------------------------------------------------------------------


def test_the_run_drafts_every_picked_chunk_once_and_resumes(
    session: Session, corpus: list[CorpusBook], tmp_path: Path
) -> None:
    out = tmp_path / "drafts.jsonl"
    picked = pick_chunks(session, corpus, [])
    answers = [draft_answer(p.kind) for p in picked]
    shown: list[str] = []

    assert run_drafts(
        session, corpus, [], client(FakeDeepSeek(answers[:3])), out, 1, shown.append, 3
    ) == (3, 0)
    rest = FakeDeepSeek(answers[3:])
    assert run_drafts(session, corpus, [], client(rest), out, 1, shown.append) == (
        len(picked) - 3,
        0,
    )

    entries = read_log(out)
    assert sorted(entry["id"] for entry in entries) == sorted(p.id for p in picked)
    assert all(entry["kind"] == p.kind for entry, p in zip(entries, picked, strict=True))
    assert run_drafts(session, corpus, [], client(FakeDeepSeek([])), out, 1, shown.append) == (0, 0)


def test_the_run_refuses_more_workers_than_the_protocol_allows(
    session: Session, corpus: list[CorpusBook], tmp_path: Path
) -> None:
    with pytest.raises(ValueError, match="workers"):
        run_drafts(session, corpus, [], client(FakeDeepSeek([])), tmp_path / "d.jsonl", 9, print)


def test_a_draft_entry_keeps_what_the_review_needs(
    session: Session, corpus: list[CorpusBook], tmp_path: Path
) -> None:
    out = tmp_path / "drafts.jsonl"
    picked = pick_chunks(session, corpus, [])[0]
    run_drafts(
        session, corpus, [], client(FakeDeepSeek([draft_answer(picked.kind)])), out, 1, print, 1
    )

    (entry,) = read_log(out)
    expected = dataclasses.asdict(picked.book)
    assert entry["book_sha256"] == expected["sha256"]
    assert entry["genre"] == expected["genre"]
    assert entry["position"] == picked.chunk.position
    assert {"answer", "evidence", "model", "system_fingerprint", "prompt_version"} <= set(entry)
