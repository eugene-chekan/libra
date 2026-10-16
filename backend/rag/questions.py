"""The test questions: the hand set the author writes, one question per test book."""

import json
import os
import random
import re
from collections.abc import Callable
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path

from rag.chunking import CHUNKER_VERSION, SHORT_CHUNK_WORDS, TextChunk
from rag.corpus import CorpusBook, CorpusError, frozen_chunks

HAND_SEED = "hand-2026-10-19"
HAND_SET_SIZE = 40
QUESTION_KINDS = ("factual", "interpretive")

QUESTION_PROMPT = "Question (s = skip this chunk, q = quit): "
REASON_PROMPT = "Why skip? "
KIND_PROMPT = "Kind (f = factual, i = interpretive): "
_KIND_KEYS = {kind[0]: kind for kind in QUESTION_KINDS}
_ID = re.compile(r"hand-(\d{3,})")


@dataclass(frozen=True)
class HandRecord:
    """One line of hand.jsonl: a kept question, or a skipped chunk with its reason."""

    id: str
    # "kept" or "skipped".
    status: str
    file: str
    book_sha256: str
    genre: str
    position: int
    chunker_version: int
    chunks_sha256: str
    # How many chunks of this book were skipped before this one.
    attempt: int
    question: str | None
    kind: str | None
    reason: str | None
    written_at: str


def pick_chunk(book: CorpusBook, chunks: list[TextChunk], attempt: int) -> TextChunk:
    """The chunk to show for a book, after `attempt` skipped ones; never a short chunk."""
    eligible = [chunk for chunk in chunks if chunk.word_count >= SHORT_CHUNK_WORDS]
    # One fixed order per book, so a skip never shows the same chunk again.
    random.Random(f"{HAND_SEED}:{book.sha256}").shuffle(eligible)
    return eligible[attempt % len(eligible)]


def _filled(text: object) -> bool:
    return isinstance(text, str) and bool(text.strip())


def _problem(record: HandRecord, earlier: list[HandRecord]) -> str | None:
    """What is wrong with a record, given the records before it; None when nothing is."""
    if not _ID.fullmatch(record.id):
        return f"the id {record.id!r} is not hand- and a number"
    if any(other.id == record.id for other in earlier):
        return f"the id {record.id} is used twice"
    if record.status == "skipped":
        return None if _filled(record.reason) else "the skip has no reason"
    if record.status != "kept":
        return f"the status {record.status!r} is not kept or skipped"
    if record.kind not in QUESTION_KINDS:
        return f"the kind {record.kind!r} is not {' or '.join(QUESTION_KINDS)}"
    if not _filled(record.question):
        return "the question is empty"
    if any(other.status == "kept" and other.book_sha256 == record.book_sha256 for other in earlier):
        return f"{record.file} already has a kept question"
    return None


def read_records(path: Path) -> list[HandRecord]:
    """Read and check hand.jsonl; a file that does not exist yet holds no records.

    Raises:
        CorpusError: A line is not a valid record, naming its number.
    """
    if not path.exists():
        return []
    records: list[HandRecord] = []
    with path.open(encoding="utf-8") as handle:
        for number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                record = HandRecord(**json.loads(line))
            except (ValueError, TypeError) as exc:
                raise CorpusError(f"{path.name} line {number} is not a record: {exc}") from exc
            problem = _problem(record, records)
            if problem:
                raise CorpusError(f"{path.name} line {number}: {problem}")
            records.append(record)
    return records


def next_task(books: list[CorpusBook], records: list[HandRecord]) -> tuple[CorpusBook, int] | None:
    """The first test book with no kept question, and how many of its chunks were skipped."""
    for book in books:
        if book.role != "test":
            continue
        own = [record for record in records if record.book_sha256 == book.sha256]
        if not any(record.status == "kept" for record in own):
            return book, len(own)
    return None


def _ask_until(ask: Callable[[str], str], prompt: str, accept: Callable[[str], bool]) -> str:
    while True:
        answer = ask(prompt).strip()
        if accept(answer):
            return answer


def _screen(book: CorpusBook, chunk: TextChunk, records: list[HandRecord]) -> str:
    kept = [record for record in records if record.status == "kept"]
    kinds = ", ".join(
        f"{sum(1 for record in kept if record.kind == kind)} {kind}" for kind in QUESTION_KINDS
    )
    return "\n".join(
        [
            "",
            f"{len(kept)}/{HAND_SET_SIZE} written ({kinds})",
            f"{book.genre}: {book.title}",
            f"Chapter: {chunk.chapter_title or '(no title)'}",
            "",
            chunk.text,
            "",
        ]
    )


def _next_id(records: list[HandRecord]) -> str:
    """One past the largest id, so an id stays unique after a line is deleted."""
    largest = max((int(_ID.fullmatch(record.id)[1]) for record in records), default=0)
    return f"hand-{largest + 1:03d}"


def _answer(record: HandRecord) -> str:
    if record.status == "kept":
        return f"  {record.file}: {record.question} ({record.kind})"
    return f"  {record.file}: skipped ({record.reason})"


def _refuse_a_changed_file(
    out: Path, records: list[HandRecord], written: list[HandRecord], pending: HandRecord
) -> None:
    """Stop before writing when `out` no longer holds what this session expects.

    Raises:
        CorpusError: Listing this session's answers that are not in the file.
    """
    try:
        on_disk = read_records(out)
    except CorpusError:
        on_disk = []
    if on_disk == records:
        return
    missing = [record for record in written if record not in on_disk] + [pending]
    raise CorpusError(
        "\n".join(
            [
                f"{out.name} changed while this session was open: another session or an "
                "editor wrote it. Nothing more was written. Run the command again. These "
                "answers are not in the file:",
                *map(_answer, missing),
            ]
        )
    )


def _append(out: Path, record: HandRecord) -> None:
    """Add one line, and make sure it is on disk before the next prompt."""
    # An editor may have saved the file without a final line break.
    joined = out.exists() and out.read_bytes()[-1:] not in (b"", b"\n")
    with out.open("a", encoding="utf-8", newline="\n") as handle:
        if joined:
            handle.write("\n")
        handle.write(json.dumps(asdict(record), ensure_ascii=False) + "\n")
        handle.flush()
        os.fsync(handle.fileno())


def run_session(
    books: list[CorpusBook],
    folder: Path,
    digests: dict[str, str],
    count_tokens: Callable[[str], int],
    out: Path,
    ask: Callable[[str], str],
    show: Callable[[str], None],
    today: date,
) -> int:
    """Show one chunk per test book still without a question, and record each answer.

    Args:
        books: From `read_corpus`, their files already checked.
        folder: Holds the files.
        digests: From `read_digests`.
        count_tokens: The embedding model's token count for a text.
        out: hand.jsonl. Records already there are kept, and the session resumes after them.
        ask: Shows a prompt and returns what the author typed.
        show: Prints a screen.
        today: Written into each record.

    Returns:
        How many questions were kept in this session.

    Raises:
        CorpusError: A book's chunks differ from the frozen ones, a line of `out` is not a
            valid record, or `out` changed during the session.
    """
    records = read_records(out)
    written: list[HandRecord] = []
    chunks_by_file: dict[str, list[TextChunk]] = {}
    kept = 0
    while (task := next_task(books, records)) is not None:
        book, attempt = task
        if book.file not in chunks_by_file:
            chunks_by_file[book.file] = frozen_chunks(
                folder / book.file, book.file, count_tokens, digests
            )
        chunk = pick_chunk(book, chunks_by_file[book.file], attempt)
        show(_screen(book, chunk, records))

        question = _ask_until(ask, QUESTION_PROMPT, bool)
        command = question.lower()
        if command == "q":
            return kept
        if command == "s":
            status, question, kind = "skipped", None, None
            reason = _ask_until(ask, REASON_PROMPT, bool)
        else:
            key = _ask_until(ask, KIND_PROMPT, lambda answer: answer.lower() in _KIND_KEYS)
            status, kind, reason = "kept", _KIND_KEYS[key.lower()], None

        record = HandRecord(
            id=_next_id(records),
            status=status,
            file=book.file,
            book_sha256=book.sha256,
            genre=book.genre,
            position=chunk.position,
            chunker_version=CHUNKER_VERSION,
            chunks_sha256=digests[book.file],
            attempt=attempt,
            question=question,
            kind=kind,
            reason=reason,
            written_at=today.isoformat(),
        )
        _refuse_a_changed_file(out, records, written, record)
        _append(out, record)
        records.append(record)
        written.append(record)
        if status == "kept":
            kept += 1
    show(f"All {sum(1 for record in records if record.status == 'kept')} questions are written.")
    return kept
