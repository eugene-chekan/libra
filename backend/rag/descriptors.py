"""Semantic descriptors: the prompts, the shape check, the response log, the prompt pilot."""

import json
import os
import random
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

from rag.chunking import SHORT_CHUNK_WORDS
from rag.corpus import CorpusBook, CorpusError, frozen_chunks
from rag.deepseek import Completion, DeepSeek, InvalidOutputError

PROMPT_VERSION = "v0"
CHUNK_DESCRIPTORS = 8
QUESTION_DESCRIPTORS = 5
DESCRIPTOR_WORDS = (2, 6)
PILOT_SEED = "pilot-v0"
SHOWN_CHARACTERS = 300

CHUNK_PROMPT = """\
You write descriptors for a search index of book passages. Read the passage and write \
exactly 8 descriptors of what it is about: its themes, situations, actions, feelings and \
ideas. Each descriptor is 2 to 6 words. Describe only what this passage says or shows. Do \
not use names of people or places, and do not guess which book it is from. Answer in json, \
exactly in this form:
{"descriptors": ["moral choice under pressure", "...", "...", "...", "...", "...", "...", "..."]}"""

QUESTION_PROMPT = """\
You write descriptors for a search index of book passages. Read the reader's question and \
write exactly 5 descriptors of what it asks about: its themes, situations, actions, feelings \
and ideas. Each descriptor is 2 to 6 words. Do not use names of people or places, and do not \
guess which book it is about. Answer in json, exactly in this form:
{"descriptors": ["moral choice under pressure", "...", "...", "...", "..."]}"""

_KINDS = {
    "chunk": (CHUNK_PROMPT, CHUNK_DESCRIPTORS),
    "question": (QUESTION_PROMPT, QUESTION_DESCRIPTORS),
}


def parse_descriptors(data: dict, count: int) -> list[str]:
    """Read the descriptors out of a model's answer.

    Args:
        data: The answer, as parsed JSON.
        count: How many descriptors the prompt asked for.

    Returns:
        The descriptors, each with single spaces between its words.

    Raises:
        ValueError: `data["descriptors"]` is not a list of exactly `count` strings of 2 to
            6 words each.
    """
    items = data.get("descriptors")
    if not isinstance(items, list) or len(items) != count:
        raise ValueError(f"expected a list of exactly {count} descriptors")
    least, most = DESCRIPTOR_WORDS
    descriptors = []
    for item in items:
        if not isinstance(item, str) or not least <= len(item.split()) <= most:
            raise ValueError(f"a descriptor is not {least} to {most} words: {item!r}")
        descriptors.append(" ".join(item.split()))
    return descriptors


def describe(
    deepseek: DeepSeek, prompt: str, text: str, count: int
) -> tuple[list[str], Completion]:
    """Ask for the descriptors of one text; the model sees the text and nothing else.

    Args:
        deepseek: The client.
        prompt: `CHUNK_PROMPT` or `QUESTION_PROMPT`.
        text: A chunk's text, or a question.
        count: How many descriptors the prompt asks for.

    Returns:
        The descriptors, and the answer they came from.

    Raises:
        InvalidOutputError: No attempt gave `count` well-formed descriptors.
        StopRunError: The key was refused or the balance is empty.
    """
    completion = deepseek.complete_json(prompt, text, lambda data: parse_descriptors(data, count))
    return parse_descriptors(completion.data, count), completion


def append_log(path: Path, entry: dict) -> None:
    """Add one JSON line, and make sure it is on disk before the next request."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
        handle.flush()
        os.fsync(handle.fileno())


def read_log(path: Path) -> list[dict]:
    """Read every entry of a response log; a missing file is an empty log.

    Raises:
        CorpusError: A line is not JSON.
    """
    if not path.exists():
        return []
    entries = []
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        try:
            entries.append(json.loads(line))
        except json.JSONDecodeError as exc:
            raise CorpusError(f"{path.name} line {number} is not JSON: {exc.msg}") from exc
    return entries


def _identity(entry: dict) -> tuple:
    """What an entry describes; one request is made for each."""
    return (
        entry["kind"],
        entry.get("file"),
        entry.get("position"),
        entry.get("question"),
        entry["prompt_version"],
    )


def _describe_and_log(deepseek: DeepSeek, out: Path, subject: dict, text: str) -> dict:
    """Describe one text and log the answer, usable or not; returns the log entry."""
    prompt, count = _KINDS[subject["kind"]]
    try:
        descriptors, completion = describe(deepseek, prompt, text, count)
        error = None
    except InvalidOutputError as exc:
        descriptors, completion, error = None, exc.completion, str(exc)
    entry = {
        **subject,
        "prompt_version": PROMPT_VERSION,
        "status": "ok" if error is None else "failed",
        "descriptors": descriptors,
        "raw": completion.content,
        "model": completion.model,
        "system_fingerprint": completion.system_fingerprint,
        "prompt_tokens": completion.prompt_tokens,
        "completion_tokens": completion.completion_tokens,
        "seconds": round(completion.seconds, 3),
        "attempts": completion.attempts,
        "error": error,
        "at": datetime.now(UTC).isoformat(timespec="seconds"),
    }
    append_log(out, entry)
    return entry


def _screen(heading: str, text: str, entry: dict) -> str:
    if entry["descriptors"] is None:
        result = [f"  FAILED: {entry['error']}"]
    else:
        result = [f"  - {item}" for item in entry["descriptors"]]
    return "\n".join([heading, text[:SHOWN_CHARACTERS], *result, ""])


def run_pilot(
    books: list[CorpusBook],
    folder: Path,
    digests: dict[str, str],
    count_tokens: Callable[[str], int],
    deepseek: DeepSeek,
    out: Path,
    sample: int,
    questions: list[str],
    show: Callable[[str], None],
) -> tuple[int, int]:
    """Write descriptors for sampled chunks of the pilot books, then for the questions.

    Args:
        books: From `read_corpus`; only the books with the role `pilot` are used.
        folder: Holds the files.
        digests: From `read_digests`.
        count_tokens: The embedding model's token count for a text.
        deepseek: The client.
        out: The response log. What it already holds is not asked for again.
        sample: Chunks per book, of `SHORT_CHUNK_WORDS` words or more.
        questions: Each gets `QUESTION_DESCRIPTORS` descriptors.
        show: Prints each text and its descriptors.

    Returns:
        How many answers this run logged as ok, and how many as failed.

    Raises:
        CorpusError: A pilot book's chunks differ from the frozen ones, or a line of `out`
            is not JSON. Raised before any request.
        StopRunError: The key was refused or the balance is empty.
    """
    done = {_identity(entry) for entry in read_log(out)}
    tasks: list[tuple[dict, str, str]] = []
    for book in books:
        if book.role != "pilot":
            continue
        chunks = frozen_chunks(folder / book.file, book.file, count_tokens, digests)
        eligible = [chunk for chunk in chunks if chunk.word_count >= SHORT_CHUNK_WORDS]
        # A shuffle, not a sample: a larger sample then keeps the chunks of a smaller one.
        random.Random(f"{PILOT_SEED}:{book.sha256}").shuffle(eligible)
        for chunk in eligible[:sample]:
            subject = {"kind": "chunk", "file": book.file, "position": chunk.position}
            tasks.append((subject, f"{book.file}, chunk {chunk.position}", chunk.text))
    for question in questions:
        tasks.append(({"kind": "question", "question": question}, "Question", question))

    counts = {"ok": 0, "failed": 0}
    for subject, heading, text in tasks:
        if _identity({**subject, "prompt_version": PROMPT_VERSION}) in done:
            continue
        entry = _describe_and_log(deepseek, out, subject, text)
        counts[entry["status"]] += 1
        show(_screen(heading, text, entry))
    return counts["ok"], counts["failed"]
