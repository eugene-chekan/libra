"""Semantic descriptors: the prompts, the shape check, the log, the pilot, the run, the import."""

import json
import os
import random
import threading
from collections.abc import Callable
from concurrent.futures import Future, ThreadPoolExecutor, as_completed
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import func
from sqlmodel import Session, col, select

from app.config import Settings
from app.models import Descriptor
from rag.chunking import SHORT_CHUNK_WORDS
from rag.corpus import CorpusBook, CorpusError, frozen_chunks
from rag.deepseek import Completion, DeepSeek, InvalidOutputError
from rag.embeddings import Embedder, embed_passages, vector_bytes
from rag.index import indexed_chunks
from rag.questions import QuestionRecord, used_questions

PROMPT_VERSION = "v1"
CHUNK_DESCRIPTORS = 8
QUESTION_DESCRIPTORS = 5
DESCRIPTOR_WORDS = (2, 6)
# Wider than the prompt asks: at temperature 0 a retry repeats a 1- or 7-word descriptor,
# so the 2-6 check failed 2.9% of the chunks (protocol v1, deviation 1).
ACCEPTED_WORDS = (1, 8)
PILOT_SEED = "pilot-v0"
SHOWN_CHARACTERS = 300
# DeepSeek has no batch API; the protocol allows this many requests at once.
RUN_WORKERS = 8

CHUNK_PROMPT = """\
You write descriptors for a search index of book passages. Read the passage and write \
exactly 8 descriptors of what it is about: its themes, situations, actions, feelings and \
ideas. Each descriptor is 2 to 6 words. Describe only what this passage says or shows. Do \
not use names of people or places, and do not guess which book it is from. Answer in json, \
exactly in this form, with your 8 descriptors in place of the dots:
{"descriptors": ["...", "...", "...", "...", "...", "...", "...", "..."]}"""

QUESTION_PROMPT = """\
You write descriptors for a search index of book passages. Read the reader's question and \
write exactly 5 descriptors of what it asks about: its themes, situations, actions, feelings \
and ideas. Each descriptor is 2 to 6 words. Describe only what the question itself asks. Do \
not use names of people or places, and do not use anything you know about a person, place \
or book that the question names. Answer in json, exactly in this form, with your 5 \
descriptors in place of the dots:
{"descriptors": ["...", "...", "...", "...", "..."]}"""

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
        ValueError: `data["descriptors"]` is not a list of exactly `count` strings, each of
            `ACCEPTED_WORDS` words.
    """
    items = data.get("descriptors")
    if not isinstance(items, list) or len(items) != count:
        raise ValueError(f"expected a list of exactly {count} descriptors")
    least, most = ACCEPTED_WORDS
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
    # An editor may have saved the file without a final line break.
    joined = False
    if path.exists() and path.stat().st_size:
        with path.open("rb") as tail:
            tail.seek(-1, os.SEEK_END)
            joined = tail.read(1) != b"\n"
    with path.open("a", encoding="utf-8", newline="\n") as handle:
        if joined:
            handle.write("\n")
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
    entry = _entry(deepseek, subject, text)
    append_log(out, entry)
    return entry


def _entry(deepseek: DeepSeek, subject: dict, text: str) -> dict:
    """Describe one text; the log entry for the answer, usable or not."""
    prompt, count = _KINDS[subject["kind"]]
    try:
        descriptors, completion = describe(deepseek, prompt, text, count)
        error = None
    except InvalidOutputError as exc:
        descriptors, completion, error = None, exc.completion, str(exc)
    return {
        **subject,
        "prompt_version": PROMPT_VERSION,
        "status": "ok" if error is None else "failed",
        "descriptors": descriptors,
        "raw": completion.content,
        "model": completion.model,
        "system_fingerprint": completion.system_fingerprint,
        "prompt_tokens": completion.prompt_tokens,
        "cache_hit_tokens": completion.cache_hit_tokens,
        "completion_tokens": completion.completion_tokens,
        "seconds": round(completion.seconds, 3),
        "attempts": completion.attempts,
        "error": error,
        "at": datetime.now(UTC).isoformat(timespec="seconds"),
    }


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


def run_describe(
    session: Session,
    books: list[CorpusBook],
    deepseek: DeepSeek,
    out: Path,
    workers: int,
    show: Callable[[str], None],
    limit: int | None = None,
) -> tuple[int, int]:
    """Write descriptors for every indexed chunk of the test books, several requests at once.

    Every chunk is found before the first request. Each answer is logged as it arrives,
    in the order the answers arrive.

    Args:
        session: Open session on the experiment database.
        books: From `read_corpus`; only the books with the role `test` are used.
        deepseek: The client.
        out: The response log. What it already holds is not asked for again.
        workers: Requests at once, from 1 to `RUN_WORKERS`.
        show: Told about each answer once it is logged.
        limit: Ask for at most this many chunks in this run.

    Returns:
        How many answers this run logged as ok, and how many as failed.

    Raises:
        ValueError: `workers` is out of range. Raised before any request.
        CorpusError: A test book is not indexed, or a line of `out` is not JSON.
        StopRunError: The key was refused or the balance is empty. The answers that
            arrived are logged; no new request starts.
    """
    subjects = [
        ({"kind": "chunk", "file": book.file, "position": chunk.position}, chunk.text)
        for book in books
        if book.role == "test"
        for chunk in indexed_chunks(session, book)
    ]
    return _describe_new(subjects, deepseek, out, workers, show, limit)


def run_describe_questions(
    records: list[QuestionRecord],
    deepseek: DeepSeek,
    out: Path,
    workers: int,
    show: Callable[[str], None],
) -> tuple[int, int]:
    """Write descriptors for every question the experiment uses, several requests at once.

    Args:
        records: Hand records and review records; skipped and dropped ones are left out.
        deepseek: The client.
        out: The question descriptor log. What it already holds is not asked for again.
        workers: Requests at once, from 1 to `RUN_WORKERS`.
        show: Told about each answer once it is logged.

    Returns:
        How many answers this run logged as ok, and how many as failed.

    Raises:
        ValueError: `workers` is out of range. Raised before any request.
        CorpusError: A line of `out` is not JSON.
        StopRunError: The key was refused or the balance is empty.
    """
    subjects = [
        ({"kind": "question", "id": record.id, "question": record.question}, record.question)
        for record in used_questions(records)
    ]
    return _describe_new(subjects, deepseek, out, workers, show)


def _describe_new(
    subjects: list[tuple[dict, str]],
    deepseek: DeepSeek,
    out: Path,
    workers: int,
    show: Callable[[str], None],
    limit: int | None = None,
) -> tuple[int, int]:
    """Describe each subject the log does not hold yet, in parallel; the ok and failed counts."""
    if not 1 <= workers <= RUN_WORKERS:
        raise ValueError(f"workers must be from 1 to {RUN_WORKERS}, not {workers}")
    done = {_identity(entry) for entry in read_log(out)}
    tasks = [
        (subject, text)
        for subject, text in subjects
        if _identity({**subject, "prompt_version": PROMPT_VERSION}) not in done
    ][:limit]

    counts = {"ok": 0, "failed": 0}

    def record(entry: dict) -> None:
        append_log(out, entry)
        counts[entry["status"]] += 1
        logged = counts["ok"] + counts["failed"]
        show(f"{logged}/{len(tasks)} {_label(entry)}: {entry['status']}")

    in_parallel(tasks, lambda subject, text: _entry(deepseek, subject, text), workers, record)
    return counts["ok"], counts["failed"]


def _label(entry: dict) -> str:
    if entry["kind"] == "chunk":
        return f"{entry['file']} chunk {entry['position']}"
    return entry.get("id") or entry["question"]


def in_parallel(
    tasks: list[tuple[dict, str]],
    work: Callable[[dict, str], dict],
    workers: int,
    record: Callable[[dict], None],
) -> None:
    """Run `work` on each task in a pool, and `record` each result on this thread.

    The first error, or Ctrl-C, stops every task not yet started. The answers of the
    requests already running are still recorded, and then the error is raised.
    """
    stop = threading.Event()

    def guarded(subject: dict, text: str) -> dict | None:
        # A worker takes its next task before this thread sees the last one fail.
        if stop.is_set():
            return None
        try:
            return work(subject, text)
        except BaseException:
            stop.set()
            raise

    pool = ThreadPoolExecutor(max_workers=workers)
    futures = [pool.submit(guarded, subject, text) for subject, text in tasks]
    recorded: set[Future] = set()
    try:
        for future in as_completed(futures):
            result = future.result()
            recorded.add(future)
            if result is not None:
                record(result)
    except BaseException:
        stop.set()
        pool.shutdown(wait=True, cancel_futures=True)
        for future in futures:
            if future in recorded or future.cancelled() or future.exception() is not None:
                continue
            if (result := future.result()) is not None:
                record(result)
        raise
    pool.shutdown()


def logged_descriptors(entry: dict, count: int) -> list[str] | None:
    """The descriptors in a log entry's raw answer, checked again; None if it fails.

    The entry's `status` is what the check said when the answer arrived. The raw answer
    is read again, so a later check (protocol v1, deviation 1) applies to old answers too.
    """
    try:
        data = json.loads(entry["raw"] or "")
        if not isinstance(data, dict):
            return None
        return parse_descriptors(data, count)
    except (json.JSONDecodeError, ValueError):
        return None


def import_descriptors(
    session: Session,
    books: list[CorpusBook],
    entries: list[dict],
    settings: Settings,
    model: Embedder,
    progress: Callable[[str], None] | None = None,
) -> tuple[int, int, int]:
    """Store the logged chunk descriptors of every test book, each with its vector.

    Every entry is matched to a stored chunk before anything is written. Then each book
    is written in its own transaction, so a stop leaves whole books only. Books already
    imported at this `PROMPT_VERSION` and embedding model are skipped.

    Args:
        session: Open session on the experiment database.
        books: From `read_corpus`; only the books with the role `test` are used.
        entries: From `read_log`; entries of another kind or prompt version are left out.
        settings: Names the embedding model.
        model: The embedding model. Descriptors get no prefix.
        progress: Told about each book once it is stored.

    Returns:
        How many books were imported now, how many already were, and how many of the
        imported chunks had no valid descriptors.

    Raises:
        CorpusError: A test book is not indexed, a chunk has no entry or two, or an entry
            names a chunk that is not stored.
    """
    logged: dict[tuple[str, int], dict] = {}
    for entry in entries:
        if entry["kind"] != "chunk" or entry["prompt_version"] != PROMPT_VERSION:
            continue
        key = (entry["file"], entry["position"])
        if key in logged:
            raise CorpusError(f"{key[0]} chunk {key[1]}: logged twice")
        logged[key] = entry
    tests = [book for book in books if book.role == "test"]
    files = {book.file for book in tests}
    strangers = sorted(key for key in logged if key[0] not in files)
    if strangers:
        raise CorpusError(f"{strangers[0][0]} chunk {strangers[0][1]}: not a test book")

    todo = []
    already = 0
    for book in tests:
        chunks = {chunk.position: chunk for chunk in indexed_chunks(session, book)}
        mine = {position for file, position in logged if file == book.file}
        if extra := sorted(mine - chunks.keys()):
            raise CorpusError(f"{book.file} chunk {extra[0]}: not stored; is it indexed?")
        if missing := sorted(chunks.keys() - mine):
            raise CorpusError(f"{book.file} chunk {missing[0]}: not in the log; run describe first")
        if _has_descriptors(session, [chunk.id for chunk in chunks.values()], settings):
            already += 1
            continue
        todo.append((book, chunks))

    failed = 0
    for book, chunks in todo:
        rows = []
        for position, chunk in chunks.items():
            descriptors = logged_descriptors(logged[(book.file, position)], CHUNK_DESCRIPTORS)
            if descriptors is None:
                failed += 1
                continue
            rows.extend((chunk.id, index, text) for index, text in enumerate(descriptors))
        _store_descriptors(session, rows, model, settings.embedding_model)
        if progress:
            progress(f"{book.file}: {len(rows)} descriptors")
    return len(todo), already, failed


def _has_descriptors(session: Session, chunk_ids: list[int | None], settings: Settings) -> bool:
    count = session.exec(
        select(func.count())
        .select_from(Descriptor)
        .where(
            col(Descriptor.chunk_id).in_(chunk_ids),
            Descriptor.prompt_version == PROMPT_VERSION,
            Descriptor.model == settings.embedding_model,
        )
    ).one()
    return count > 0


def _store_descriptors(
    session: Session, rows: list[tuple[int | None, int, str]], model: Embedder, model_name: str
) -> None:
    """Write one book's descriptors and vectors in one transaction: all of them, or none."""
    try:
        vectors = embed_passages(model, [text for _, _, text in rows]) if rows else []
        session.add_all(
            Descriptor(
                chunk_id=chunk_id,
                prompt_version=PROMPT_VERSION,
                model=model_name,
                position=position,
                text=text,
                vector=vector_bytes(vector),
            )
            for (chunk_id, position, text), vector in zip(rows, vectors, strict=True)
        )
        session.commit()
    except BaseException:
        session.rollback()
        raise
