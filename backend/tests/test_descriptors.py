"""Descriptors: the shape check, the response log, and the pilot on the pilot books."""

import dataclasses
import json
from collections.abc import Generator
from datetime import datetime
from pathlib import Path

import pytest
from pydantic import SecretStr

from app.cli import main
from app.config import Settings, get_settings
from rag.chunking import SHORT_CHUNK_WORDS, chunk_book
from rag.corpus import CorpusBook, CorpusError, book_stats, write_stats
from rag.deepseek import JSON_ATTEMPTS, KEY_SETTING, DeepSeek, StopRunError
from rag.descriptors import (
    CHUNK_DESCRIPTORS,
    CHUNK_PROMPT,
    DESCRIPTOR_WORDS,
    PROMPT_VERSION,
    QUESTION_DESCRIPTORS,
    QUESTION_PROMPT,
    SHOWN_CHARACTERS,
    append_log,
    describe,
    parse_descriptors,
    read_log,
    run_pilot,
)
from tests.corpus_helpers import chapters_book, row, words_as_tokens, write_csv
from tests.fake_deepseek import FINGERPRINT, SERVED_MODEL, FakeDeepSeek, api_error
from tests.fake_embedder import FakeEmbedder

LONG_CHUNKS = 6
MOST_WORDS = DESCRIPTOR_WORDS[1]


def answer(count: int, words: int = 2) -> str:
    """A JSON answer of `count` descriptors, each of `words` words."""
    return json.dumps({"descriptors": [" ".join(["word"] * words) for _ in range(count)]})


CHUNK_ANSWER = answer(CHUNK_DESCRIPTORS)
QUESTION_ANSWER = answer(QUESTION_DESCRIPTORS)


@dataclasses.dataclass
class Pilot:
    """One pilot book and one test book on disk, and what `run_pilot` needs to read them."""

    books: list[CorpusBook]
    folder: Path
    digests: dict[str, str]
    out: Path
    shown: list[str]

    def run(
        self, fake: FakeDeepSeek, sample: int = 2, questions: tuple[str, ...] = ()
    ) -> tuple[int, int]:
        client = DeepSeek(Settings(deepseek_api_key=SecretStr("sk-test")), client=fake)
        return run_pilot(
            self.books,
            self.folder,
            self.digests,
            words_as_tokens,
            client,
            self.out,
            sample,
            list(questions),
            self.shown.append,
        )

    def entries(self) -> list[dict]:
        return read_log(self.out)


@pytest.fixture(name="pilot")
def pilot_fixture(tmp_path: Path) -> Pilot:
    """Each book has six chunks of 120 words and one chunk just under 100 words."""
    folder = tmp_path / "files"
    sizes = [120] * LONG_CHUNKS + [SHORT_CHUNK_WORDS - 1]
    books = [
        CorpusBook(**row(chapters_book(folder, "tuning.epub", sizes), role="pilot")),
        CorpusBook(**row(chapters_book(folder, "testbook.epub", sizes), role="test")),
    ]
    digests = {s.book.file: s.chunks_sha256 for s in book_stats(books, folder, words_as_tokens)}
    return Pilot(books, folder, digests, tmp_path / "pilot" / "descriptors.jsonl", [])


def test_parse_accepts_exactly_count_descriptors_of_2_to_6_words() -> None:
    least, most = DESCRIPTOR_WORDS
    data = {"descriptors": ["two words", " ".join(["w"] * most), "  spaced \n out\twords "]}

    assert parse_descriptors(data, 3) == ["two words", " ".join(["w"] * most), "spaced out words"]
    assert least == 2


@pytest.mark.parametrize(
    "data",
    [
        {"descriptors": "one string"},
        {"descriptors": ["two words"] * (CHUNK_DESCRIPTORS - 1)},
        {"descriptors": ["two words"] * (CHUNK_DESCRIPTORS + 1)},
        {"descriptors": ["two words"] * (CHUNK_DESCRIPTORS - 1) + ["one"]},
        {"descriptors": ["two words"] * (CHUNK_DESCRIPTORS - 1) + ["w " * (MOST_WORDS + 1)]},
        {"descriptors": ["two words"] * (CHUNK_DESCRIPTORS - 1) + [["a nested", "list"]]},
        {"descriptors": ["two words"] * (CHUNK_DESCRIPTORS - 1) + [7]},
        {"themes": ["two words"] * CHUNK_DESCRIPTORS},
    ],
    ids=["a string", "too few", "too many", "1 word", "7 words", "nested", "number", "no key"],
)
def test_parse_refuses_any_other_shape(data: dict) -> None:
    with pytest.raises(ValueError, match="descriptor"):
        parse_descriptors(data, CHUNK_DESCRIPTORS)


def test_a_wrong_shape_is_retried_then_logged_as_failed(pilot: Pilot) -> None:
    bad = [
        '{"descriptors": "one string"}',
        answer(CHUNK_DESCRIPTORS - 1),
        answer(CHUNK_DESCRIPTORS, words=MOST_WORDS + 1),
    ]
    assert len(bad) == JSON_ATTEMPTS
    fake = FakeDeepSeek([*bad, CHUNK_ANSWER])

    assert pilot.run(fake) == (1, 1)

    failed, ok = pilot.entries()
    assert (failed["status"], failed["descriptors"]) == ("failed", None)
    assert (failed["raw"], failed["attempts"]) == (bad[-1], JSON_ATTEMPTS)
    assert "descriptor" in failed["error"]
    assert (ok["status"], ok["error"], ok["attempts"]) == ("ok", None, 1)
    assert ok["descriptors"] == ["word word"] * CHUNK_DESCRIPTORS
    assert "FAILED" in pilot.shown[0]
    assert "FAILED" not in pilot.shown[1]


def test_an_entry_records_what_the_protocol_asks_for(pilot: Pilot) -> None:
    pilot.run(FakeDeepSeek([CHUNK_ANSWER]), sample=1)

    (entry,) = pilot.entries()
    assert set(entry) == {
        "kind",
        "file",
        "position",
        "prompt_version",
        "status",
        "descriptors",
        "raw",
        "model",
        "system_fingerprint",
        "prompt_tokens",
        "completion_tokens",
        "seconds",
        "attempts",
        "error",
        "at",
    }
    assert (entry["kind"], entry["file"]) == ("chunk", "tuning.epub")
    assert entry["prompt_version"] == PROMPT_VERSION
    assert (entry["model"], entry["system_fingerprint"]) == (SERVED_MODEL, FINGERPRINT)
    assert entry["raw"] == CHUNK_ANSWER
    assert entry["prompt_tokens"] > 0 < entry["completion_tokens"]
    assert datetime.fromisoformat(entry["at"]).utcoffset().total_seconds() == 0


def test_the_prompt_input_is_the_chunk_text_only(pilot: Pilot) -> None:
    fake = FakeDeepSeek([CHUNK_ANSWER])
    book = pilot.books[0]

    pilot.run(fake, sample=1)

    (entry,) = pilot.entries()
    chunks = chunk_book(pilot.folder / book.file, words_as_tokens)
    (request,) = fake.calls
    assert request["messages"] == [
        {"role": "system", "content": CHUNK_PROMPT},
        {"role": "user", "content": chunks[entry["position"]].text},
    ]
    assert book.author not in json.dumps(request)
    assert book.file not in json.dumps(request)


def test_both_prompts_satisfy_json_mode_and_name_their_numbers() -> None:
    fake = FakeDeepSeek([CHUNK_ANSWER, QUESTION_ANSWER])
    client = DeepSeek(Settings(deepseek_api_key=SecretStr("sk-test")), client=fake)

    chunk_descriptors, _ = describe(client, CHUNK_PROMPT, "a passage", CHUNK_DESCRIPTORS)
    question_descriptors, _ = describe(client, QUESTION_PROMPT, "why?", QUESTION_DESCRIPTORS)

    assert len(chunk_descriptors) == CHUNK_DESCRIPTORS
    assert len(question_descriptors) == QUESTION_DESCRIPTORS
    words = "{} to {} words".format(*DESCRIPTOR_WORDS)
    for prompt, count in (
        (CHUNK_PROMPT, CHUNK_DESCRIPTORS),
        (QUESTION_PROMPT, QUESTION_DESCRIPTORS),
    ):
        assert f"exactly {count} descriptors" in prompt
        assert words in prompt
        example = json.loads(prompt.splitlines()[-1])
        assert len(example["descriptors"]) == count


def test_every_response_is_logged_before_the_next_request(pilot: Pilot) -> None:
    lines_at_each_request: list[int] = []

    def count_lines() -> None:
        lines_at_each_request.append(len(pilot.entries()))

    fake = FakeDeepSeek([CHUNK_ANSWER] * 3 + [QUESTION_ANSWER], on_request=count_lines)

    pilot.run(fake, sample=3, questions=("Why did they leave?",))

    assert lines_at_each_request == [0, 1, 2, 3]
    assert len(pilot.entries()) == 4


def test_the_pilot_resumes_without_calling_again(pilot: Pilot) -> None:
    question = "Why did they leave?"
    bad = [answer(1)] * JSON_ATTEMPTS
    assert pilot.run(FakeDeepSeek([*bad, CHUNK_ANSWER, QUESTION_ANSWER]), questions=(question,))
    before = pilot.out.read_bytes()
    pilot.shown.clear()
    again = FakeDeepSeek([])

    assert pilot.run(again, questions=(question,)) == (0, 0)

    assert again.calls == []
    assert pilot.out.read_bytes() == before
    assert pilot.shown == []


def test_a_larger_sample_adds_only_the_new_chunks(pilot: Pilot) -> None:
    pilot.run(FakeDeepSeek([CHUNK_ANSWER] * 2), sample=2)
    first = [entry["position"] for entry in pilot.entries()]
    more = FakeDeepSeek([CHUNK_ANSWER] * 2)

    assert pilot.run(more, sample=4) == (2, 0)

    positions = [entry["position"] for entry in pilot.entries()]
    assert len(set(positions)) == 4
    assert set(first) < set(positions)


def test_the_pilot_uses_pilot_books_only_and_never_a_short_chunk(pilot: Pilot) -> None:
    fake = FakeDeepSeek([CHUNK_ANSWER] * LONG_CHUNKS)

    assert pilot.run(fake, sample=100) == (LONG_CHUNKS, 0)

    entries = pilot.entries()
    assert {entry["file"] for entry in entries} == {"tuning.epub"}
    assert sorted(entry["position"] for entry in entries) == list(range(LONG_CHUNKS))


def test_the_same_chunks_are_picked_on_every_machine(pilot: Pilot, tmp_path: Path) -> None:
    pilot.run(FakeDeepSeek([CHUNK_ANSWER] * 2))
    first = [entry["position"] for entry in pilot.entries()]
    pilot.out = tmp_path / "second.jsonl"

    pilot.run(FakeDeepSeek([CHUNK_ANSWER] * 2))

    assert [entry["position"] for entry in pilot.entries()] == first


def test_each_question_gets_five_descriptors_from_the_question_prompt(pilot: Pilot) -> None:
    questions = ("Why did they leave?", "Who owns the school?")
    fake = FakeDeepSeek([QUESTION_ANSWER, QUESTION_ANSWER])

    assert pilot.run(fake, sample=0, questions=questions) == (2, 0)

    assert [call["messages"] for call in fake.calls] == [
        [{"role": "system", "content": QUESTION_PROMPT}, {"role": "user", "content": question}]
        for question in questions
    ]
    entries = pilot.entries()
    assert [(entry["kind"], entry["question"]) for entry in entries] == [
        ("question", question) for question in questions
    ]
    assert all(len(entry["descriptors"]) == QUESTION_DESCRIPTORS for entry in entries)
    assert all("file" not in entry and "position" not in entry for entry in entries)


def test_a_bad_key_stops_the_pilot_at_once(pilot: Pilot) -> None:
    fake = FakeDeepSeek([CHUNK_ANSWER, api_error(401), CHUNK_ANSWER])

    with pytest.raises(StopRunError):
        pilot.run(fake, sample=3)

    assert len(fake.calls) == 2
    assert [entry["status"] for entry in pilot.entries()] == ["ok"]


def test_a_changed_pilot_book_is_refused_before_any_request(pilot: Pilot) -> None:
    pilot.digests["tuning.epub"] = "0" * 64
    fake = FakeDeepSeek([])

    with pytest.raises(CorpusError, match="tuning.epub"):
        pilot.run(fake)

    assert fake.calls == []


def test_a_log_line_keeps_its_letters_and_ends_the_file(tmp_path: Path) -> None:
    out = tmp_path / "new" / "log.jsonl"

    append_log(out, {"question": "Why “café”?"})
    append_log(out, {"question": "second"})

    assert out.read_bytes() == ('{"question": "Why “café”?"}\n{"question": "second"}\n'.encode())


def test_a_broken_log_line_is_named(tmp_path: Path) -> None:
    out = tmp_path / "log.jsonl"
    out.write_text('{"kind": "chunk"}\n{"kind": \n', encoding="utf-8")

    with pytest.raises(CorpusError, match="log.jsonl line 2"):
        read_log(out)


@pytest.fixture(name="command")
def command_fixture(
    pilot: Pilot, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Generator[list[str], None, None]:
    """The arguments of `rag pilot-describe` for the pilot fixture, with a key set."""
    corpus_csv = write_csv(tmp_path / "corpus.csv", [dataclasses.asdict(b) for b in pilot.books])
    stats = tmp_path / "corpus-stats.csv"
    write_stats(book_stats(pilot.books, pilot.folder, words_as_tokens), stats)
    monkeypatch.setattr("rag.embeddings.load_model", lambda settings: FakeEmbedder())
    monkeypatch.setenv(KEY_SETTING, "sk-test")
    get_settings.cache_clear()
    yield [
        "rag",
        "pilot-describe",
        str(corpus_csv),
        str(pilot.folder),
        "--stats",
        str(stats),
        "--out",
        str(pilot.out),
    ]
    get_settings.cache_clear()


def test_the_command_prints_each_chunk_and_its_descriptors(
    pilot: Pilot,
    command: list[str],
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = FakeDeepSeek([CHUNK_ANSWER, CHUNK_ANSWER, QUESTION_ANSWER])
    monkeypatch.setattr("rag.deepseek.openai.OpenAI", lambda **kwargs: fake)
    questions = tmp_path / "questions.txt"
    questions.write_text("Why did they leave?\n\n", encoding="utf-8")

    assert main([*command, "--sample", "2", "--questions", str(questions)]) == 0

    out = capsys.readouterr().out
    entries = pilot.entries()
    chunks = chunk_book(pilot.folder / "tuning.epub", words_as_tokens)
    text = chunks[entries[0]["position"]].text
    assert text[:SHOWN_CHARACTERS] in out
    assert text[: SHOWN_CHARACTERS + 1] not in out
    assert out.count("- word word") == 2 * CHUNK_DESCRIPTORS + QUESTION_DESCRIPTORS
    assert "Why did they leave?" in out
    assert "3 ok, 0 failed" in out
    assert [entry["kind"] for entry in entries] == ["chunk", "chunk", "question"]


def test_the_command_names_a_missing_key_before_it_loads_the_model(
    command: list[str], capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    def no_model(settings: Settings) -> FakeEmbedder:
        raise AssertionError("loaded the model before checking the key")

    monkeypatch.setattr("rag.embeddings.load_model", no_model)
    monkeypatch.setenv(KEY_SETTING, "")
    get_settings.cache_clear()

    assert main(command) == 1

    assert KEY_SETTING in capsys.readouterr().err


@pytest.mark.parametrize("status", [401, 429])
def test_the_command_reports_a_failed_request_without_a_traceback(
    status: int,
    pilot: Pilot,
    command: list[str],
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = FakeDeepSeek([CHUNK_ANSWER, api_error(status)])
    monkeypatch.setattr("rag.deepseek.openai.OpenAI", lambda **kwargs: fake)

    assert main([*command, "--sample", "2"]) == 1

    err = capsys.readouterr().err
    assert err.startswith("error: ")
    assert str(status) in err
    assert len(pilot.entries()) == 1


def test_an_answer_to_another_prompt_version_is_asked_for_again(
    pilot: Pilot, monkeypatch: pytest.MonkeyPatch
) -> None:
    pilot.run(FakeDeepSeek([CHUNK_ANSWER]), sample=1)
    monkeypatch.setattr("rag.descriptors.PROMPT_VERSION", "v-next")

    assert pilot.run(FakeDeepSeek([CHUNK_ANSWER]), sample=1) == (1, 0)

    assert [entry["prompt_version"] for entry in pilot.entries()] == [PROMPT_VERSION, "v-next"]


def test_the_command_names_a_missing_pilot_file(
    pilot: Pilot,
    command: list[str],
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = FakeDeepSeek([])
    monkeypatch.setattr("rag.deepseek.openai.OpenAI", lambda **kwargs: fake)
    (pilot.folder / "tuning.epub").unlink()

    assert main(command) == 1

    assert "tuning.epub: missing" in capsys.readouterr().err
    assert fake.calls == []
