"""Drafted test questions: the chunks they come from, the prompts, the 4-word check, the run."""

import hashlib
import random
import re
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from sqlmodel import Session

from app.models import Chunk
from rag.chunking import CHUNKER_VERSION, SHORT_CHUNK_WORDS
from rag.corpus import CorpusBook
from rag.deepseek import Completion, DeepSeek, InvalidOutputError
from rag.descriptors import RUN_WORKERS, append_log, in_parallel, read_log
from rag.index import indexed_chunks
from rag.questions import QUESTION_KINDS, HandRecord

DRAFT_PROMPT_VERSION = "d1"
DRAFT_SEED = "drafts-v1"
PARTS_PER_BOOK = 10
COPIED_WORDS = 4
# Requests for one draft: the first, and one more for each copied answer.
DRAFT_ROUNDS = 3

_KIND_RULES = {
    "factual": "a factual question: it asks who, what, where or when",
    "interpretive": "an interpretive question: it asks why, or about feelings, motives or ideas",
}

_DRAFT_PROMPT = """\
You write test questions for a search experiment over book passages. Read the passage and \
write one question that a reader of the book could ask, and that this passage alone \
answers. Write {rule}. You may use the names of people and places from the passage, so \
that it is clear which book the question is about. Do not copy any other wording from the \
passage: say it in your own words. Answer in json, exactly in this form, with your text in \
place of the dots:
{{"question": "...", "kind": "{kind}", "answer": "...", "evidence": "..."}}
The answer is short and comes from the passage. The evidence is a short quote from the \
passage that holds the answer."""

DRAFT_PROMPTS = {
    kind: _DRAFT_PROMPT.format(rule=_KIND_RULES[kind], kind=kind) for kind in QUESTION_KINDS
}

_RETRY_NOTE = (
    "Your last question repeated these words of the passage: {copied}. Write the question "
    "again in your own words."
)

_ANSWER = ("question", "answer", "evidence")
_WORD = re.compile(r"\w+(?:'\w+)*")
_SENTENCE_END = re.compile(r"(?<=[.!?…])[\"”’)]*\s+")


@dataclass(frozen=True)
class DraftChunk:
    """One chunk picked for a draft, and the kind of question to ask about it."""

    id: str
    book: CorpusBook
    chunk: Chunk
    kind: str


def pick_chunks(
    session: Session, books: list[CorpusBook], hand: list[HandRecord]
) -> list[DraftChunk]:
    """Ten chunks from each test book: one at random from each tenth of the book.

    Chunks under `SHORT_CHUNK_WORDS` words and the hand set's source chunks are never
    picked. Each book gets as many factual as interpretive questions, in a random order.
    The seed `DRAFT_SEED` makes every pick the same on every machine.

    Raises:
        CorpusError: A test book is not indexed.
    """
    used = {(record.book_sha256, record.position) for record in hand if record.status == "kept"}
    picked = []
    for book in books:
        if book.role != "test":
            continue
        chunks = indexed_chunks(session, book)
        kinds = [kind for kind in QUESTION_KINDS for _ in range(PARTS_PER_BOOK // 2)]
        random.Random(f"{DRAFT_SEED}:{book.sha256}:kinds").shuffle(kinds)
        for part in range(PARTS_PER_BOOK):
            share = chunks[
                part * len(chunks) // PARTS_PER_BOOK : (part + 1) * len(chunks) // PARTS_PER_BOOK
            ]
            eligible = [
                chunk
                for chunk in share
                if chunk.word_count >= SHORT_CHUNK_WORDS
                and (book.sha256, chunk.position) not in used
            ]
            if not eligible:
                continue
            chunk = random.Random(f"{DRAFT_SEED}:{book.sha256}:{part}").choice(eligible)
            number = len(picked) + 1
            picked.append(DraftChunk(f"draft-{number:03d}", book, chunk, kinds[part]))
    return picked


def words(text: str) -> list[str]:
    """The words of a text in lower case, as the 4-word check counts them."""
    return [word.lower() for word in _WORD.findall(text)]


def copied_sequences(question: str, chunk_text: str) -> list[str]:
    """The `COPIED_WORDS`-word sequences of the question that are in the chunk, names left out.

    A name is a word written with a capital letter that does not start a sentence, in the
    chunk or in the question. A sequence with a name in it does not count.
    """
    names = _names(chunk_text) | _names(question)
    chunk_words = words(chunk_text)
    in_chunk = {
        tuple(chunk_words[i : i + COPIED_WORDS]) for i in range(len(chunk_words) - COPIED_WORDS + 1)
    }
    question_words = words(question)
    found = []
    for i in range(len(question_words) - COPIED_WORDS + 1):
        sequence = tuple(question_words[i : i + COPIED_WORDS])
        if sequence in in_chunk and not names.intersection(sequence):
            found.append(" ".join(sequence))
    return found


def _names(text: str) -> set[str]:
    names = set()
    for sentence in _SENTENCE_END.split(text):
        for word in _WORD.findall(sentence)[1:]:
            if word[0].isupper():
                names.add(word.lower())
    return names


def parse_draft(data: dict, kind: str) -> dict:
    """Check a drafted answer's shape; returns its four fields.

    Raises:
        ValueError: A field is missing or empty, the question has no question mark, or the
            kind is not the one asked for.
    """
    fields = {}
    for field in ("question", "kind", "answer", "evidence"):
        value = data.get(field)
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"the draft has no {field}")
        fields[field] = " ".join(value.split())
    if not fields["question"].endswith("?"):
        raise ValueError("the question does not end with a question mark")
    if fields["kind"] != kind:
        raise ValueError(f"the kind is {fields['kind']!r}, not {kind!r}")
    return fields


def draft_one(deepseek: DeepSeek, picked: DraftChunk) -> dict:
    """Ask for one draft, again with a note while it copies the chunk; the log entry."""
    prompt = DRAFT_PROMPTS[picked.kind]
    text = picked.chunk.text
    rounds: list[dict] = []
    usage = {"prompt_tokens": 0, "cache_hit_tokens": 0, "completion_tokens": 0, "seconds": 0.0}
    status, fields, error, completion = "failed", None, None, None
    for _ in range(DRAFT_ROUNDS):
        note = rounds[-1]["copied"] if rounds else None
        user = text if note is None else f"{text}\n\n{_RETRY_NOTE.format(copied=', '.join(note))}"
        try:
            completion = deepseek.complete_json(
                prompt, user, lambda data: parse_draft(data, picked.kind)
            )
        except InvalidOutputError as exc:
            completion, error = exc.completion, str(exc)
            _add_usage(usage, completion)
            break
        _add_usage(usage, completion)
        fields = parse_draft(completion.data, picked.kind)
        copied = copied_sequences(fields["question"], text)
        rounds.append({"question": fields["question"], "copied": copied})
        if not copied:
            status, error = "ok", None
            break
        error = f"the question copies the chunk in {DRAFT_ROUNDS} rounds"
    return {
        "id": picked.id,
        "file": picked.book.file,
        "book_sha256": picked.book.sha256,
        "genre": picked.book.genre,
        "position": picked.chunk.position,
        "chunker_version": CHUNKER_VERSION,
        "kind": picked.kind,
        "prompt_version": DRAFT_PROMPT_VERSION,
        "status": status,
        **{field: fields[field] if status == "ok" and fields else None for field in _ANSWER},
        "rounds": rounds,
        "raw": completion.content if completion else None,
        "model": completion.model if completion else None,
        "system_fingerprint": completion.system_fingerprint if completion else None,
        **{key: round(value, 3) if key == "seconds" else value for key, value in usage.items()},
        "error": error,
        "at": datetime.now(UTC).isoformat(timespec="seconds"),
    }


def _add_usage(usage: dict, completion: Completion) -> None:
    usage["prompt_tokens"] += completion.prompt_tokens
    if completion.cache_hit_tokens is None or usage["cache_hit_tokens"] is None:
        usage["cache_hit_tokens"] = None
    else:
        usage["cache_hit_tokens"] += completion.cache_hit_tokens
    usage["completion_tokens"] += completion.completion_tokens
    usage["seconds"] += completion.seconds


def run_drafts(
    session: Session,
    books: list[CorpusBook],
    hand: list[HandRecord],
    deepseek: DeepSeek,
    out: Path,
    workers: int,
    show: Callable[[str], None],
    limit: int | None = None,
) -> tuple[int, int]:
    """Draft one question for each picked chunk the log does not hold yet, in parallel.

    Args:
        session: Open session on the indexed experiment database.
        books: From `read_corpus`; only the test books are used.
        hand: From `read_records`; their source chunks are never picked.
        deepseek: The client.
        out: The draft log. What it already holds is not asked for again.
        workers: Requests at once, from 1 to `RUN_WORKERS`.
        show: Told about each draft once it is logged.
        limit: Ask for at most this many drafts in this run.

    Returns:
        How many drafts this run logged as ok, and how many as failed.

    Raises:
        ValueError: `workers` is out of range. Raised before any request.
        CorpusError: A test book is not indexed, or a line of `out` is not JSON.
        StopRunError: The key was refused or the balance is empty.
    """
    if not 1 <= workers <= RUN_WORKERS:
        raise ValueError(f"workers must be from 1 to {RUN_WORKERS}, not {workers}")
    done = {
        entry["id"]
        for entry in read_log(out)
        if entry.get("prompt_version") == DRAFT_PROMPT_VERSION
    }
    todo = [picked for picked in pick_chunks(session, books, hand) if picked.id not in done]
    todo = todo[:limit]
    counts = {"ok": 0, "failed": 0}

    def record(entry: dict) -> None:
        append_log(out, entry)
        counts[entry["status"]] += 1
        logged = counts["ok"] + counts["failed"]
        show(
            f"{logged}/{len(todo)} {entry['id']} {entry['file']} chunk {entry['position']}: "
            f"{entry['status']}"
        )

    tasks = [({"picked": picked}, "") for picked in todo]
    in_parallel(tasks, lambda subject, _: draft_one(deepseek, subject["picked"]), workers, record)
    return counts["ok"], counts["failed"]


def draft_prompt_digests() -> dict[str, str]:
    """The sha256 of each drafting prompt, as the protocol records them."""
    return {kind: hashlib.sha256(text.encode()).hexdigest() for kind, text in DRAFT_PROMPTS.items()}
