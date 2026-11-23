"""The review of the drafted questions: the author keeps, edits or drops each one."""

import json
import os
from collections.abc import Callable
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path

from sqlmodel import Session

from rag.chunking import CHUNKER_VERSION
from rag.corpus import CorpusBook, CorpusError
from rag.descriptors import read_log
from rag.drafts import DRAFT_PROMPT_VERSION, copied_sequences
from rag.index import indexed_chunks
from rag.questions import QUESTION_KINDS

REVIEW_STATUSES = ("kept", "edited", "dropped")
# The review rules of protocol section 7, by the number the author types for a drop.
DROP_REASONS = {
    "1": "not answerable from this chunk alone",
    "2": "no real reader would ask it",
    "3": "not clear which book it is about",
    "4": "it reuses the chunk's wording",
    "5": "the kind is wrong",
}

ACTION_PROMPT = "k = keep, e = edit, d = drop, q = quit: "
EDIT_PROMPT = "New question (Enter = keep the draft's): "
EDIT_KIND_PROMPT = "Kind (Enter = {kind}, f = factual, i = interpretive): "
DROP_PROMPT = "Why drop? (" + ", ".join(f"{k} = {v}" for k, v in DROP_REASONS.items()) + "): "
_KIND_KEYS = {kind[0]: kind for kind in QUESTION_KINDS}


@dataclass(frozen=True)
class ReviewRecord:
    """One line of review.jsonl: the author's decision on one draft."""

    id: str
    # "kept", "edited" or "dropped".
    status: str
    file: str
    book_sha256: str
    genre: str
    position: int
    chunker_version: int
    # The question the experiment uses; None for a dropped draft.
    question: str | None
    kind: str | None
    draft_question: str
    draft_kind: str
    reason: str | None
    reviewed_at: str


def read_reviews(path: Path) -> list[ReviewRecord]:
    """Read and check review.jsonl; a file that does not exist yet holds no records.

    Raises:
        CorpusError: A line is not a valid record, naming its number.
    """
    if not path.exists():
        return []
    records: list[ReviewRecord] = []
    with path.open(encoding="utf-8") as handle:
        for number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                record = ReviewRecord(**json.loads(line))
            except (ValueError, TypeError) as exc:
                raise CorpusError(
                    f"{path.name} line {number}: not a review record ({exc})"
                ) from exc
            problem = _problem(record, records)
            if problem:
                raise CorpusError(f"{path.name} line {number}: {problem}")
            records.append(record)
    return records


def _problem(record: ReviewRecord, earlier: list[ReviewRecord]) -> str | None:
    if any(other.id == record.id for other in earlier):
        return f"{record.id} is reviewed twice"
    if record.status not in REVIEW_STATUSES:
        return f"the status {record.status!r} is not {', '.join(REVIEW_STATUSES)}"
    if record.status == "dropped":
        return None if _filled(record.reason) else "the drop has no reason"
    if not _filled(record.question):
        return "the question is empty"
    if record.kind not in QUESTION_KINDS:
        return f"the kind {record.kind!r} is not {' or '.join(QUESTION_KINDS)}"
    return None


def _filled(text: object) -> bool:
    return isinstance(text, str) and bool(text.strip())


def reviewable_drafts(drafts: list[dict]) -> list[dict]:
    """The drafts of the current prompt version that passed drafting, in id order."""
    return sorted(
        (
            draft
            for draft in drafts
            if draft["status"] == "ok" and draft["prompt_version"] == DRAFT_PROMPT_VERSION
        ),
        key=lambda draft: draft["id"],
    )


def run_review(
    session: Session,
    books: list[CorpusBook],
    drafts_log: Path,
    out: Path,
    ask: Callable[[str], str],
    show: Callable[[str], None],
    today: date,
) -> int:
    """Show each draft not yet reviewed with its chunk, and record the author's decision.

    Args:
        session: Open session on the indexed experiment database.
        books: From `read_corpus`.
        drafts_log: drafts.jsonl.
        out: review.jsonl. Records already there are kept, and the review resumes after them.
        ask: Shows a prompt and returns what the author typed.
        show: Prints a screen.
        today: Written into each record.

    Returns:
        How many drafts were reviewed in this session.

    Raises:
        CorpusError: A draft's chunk is not stored, a line of `out` is not a valid record,
            or `out` changed during the session.
    """
    drafts = reviewable_drafts(read_log(drafts_log))
    records = read_reviews(out)
    by_sha = {book.sha256: book for book in books}
    texts: dict[str, dict[int, str]] = {}
    done = {record.id for record in records}
    reviewed = 0
    for draft in drafts:
        if draft["id"] in done:
            continue
        book = by_sha.get(draft["book_sha256"])
        if book is None:
            raise CorpusError(f"{draft['id']}: its book is not in corpus.csv")
        if book.file not in texts:
            texts[book.file] = {c.position: c.text for c in indexed_chunks(session, book)}
        chunk = texts[book.file].get(draft["position"])
        if chunk is None or draft["chunker_version"] != CHUNKER_VERSION:
            raise CorpusError(f"{draft['id']}: its chunk is not stored")
        show(_screen(book, chunk, draft, records, len(drafts)))

        action = _ask_until(ask, ACTION_PROMPT, lambda a: a.lower() in ("k", "e", "d", "q"))
        if action.lower() == "q":
            return reviewed
        question, kind, reason = draft["question"], draft["kind"], None
        if action.lower() == "k":
            status = "kept"
        elif action.lower() == "e":
            question = _ask_edit(ask, show, chunk, draft["question"])
            key = _ask_until(
                ask,
                EDIT_KIND_PROMPT.format(kind=draft["kind"]),
                lambda a: a == "" or a.lower() in _KIND_KEYS,
            )
            kind = _KIND_KEYS[key.lower()] if key else draft["kind"]
            # An edit that changed nothing is a keep.
            changed = (question, kind) != (draft["question"], draft["kind"])
            status = "edited" if changed else "kept"
        else:
            status, question, kind = "dropped", None, None
            typed = _ask_until(ask, DROP_PROMPT, bool)
            reason = DROP_REASONS.get(typed, typed)

        record = ReviewRecord(
            id=draft["id"],
            status=status,
            file=book.file,
            book_sha256=book.sha256,
            genre=book.genre,
            position=draft["position"],
            chunker_version=draft["chunker_version"],
            question=question,
            kind=kind,
            draft_question=draft["question"],
            draft_kind=draft["kind"],
            reason=reason,
            reviewed_at=today.isoformat(),
        )
        _refuse_a_changed_file(out, records)
        _append(out, record)
        records.append(record)
        reviewed += 1
    show(f"All {len(drafts)} drafts are reviewed.")
    return reviewed


def _ask_until(ask: Callable[[str], str], prompt: str, accept: Callable[[str], bool]) -> str:
    while True:
        answer = ask(prompt).strip()
        if accept(answer):
            return answer


def _ask_edit(
    ask: Callable[[str], str], show: Callable[[str], None], chunk: str, draft_question: str
) -> str:
    """Ask for the new question until it does not repeat 4 words of the chunk.

    Enter keeps the draft's question, which passed the same check when it was drafted.
    """
    while True:
        question = " ".join(ask(EDIT_PROMPT).split())
        if not question:
            return draft_question
        copied = copied_sequences(question, chunk)
        if not copied:
            return question
        show(f"It repeats words of the chunk: {', '.join(copied)}. Write it again.")


def _screen(
    book: CorpusBook, chunk: str, draft: dict, records: list[ReviewRecord], total: int
) -> str:
    used = [record for record in records if record.status != "dropped"]
    counts = ", ".join(
        f"{sum(1 for r in used if r.genre == genre and r.kind == kind)} {genre} {kind}"
        for genre in ("fiction", "non-fiction")
        for kind in QUESTION_KINDS
    )
    return "\n".join(
        [
            "",
            f"{len(records)}/{total} reviewed; {len(used)} kept or edited ({counts})",
            f"{draft['id']}, {book.genre}: {book.title}",
            "",
            chunk,
            "",
            f"Draft ({draft['kind']}): {draft['question']}",
            f"Answer: {draft['answer']}",
            f"Evidence: {draft['evidence']}",
            "",
        ]
    )


def _refuse_a_changed_file(out: Path, records: list[ReviewRecord]) -> None:
    """Stop before writing when `out` no longer holds what this session expects.

    Raises:
        CorpusError: The file changed while the session was open.
    """
    try:
        on_disk = read_reviews(out)
    except CorpusError:
        on_disk = []
    if on_disk != records:
        raise CorpusError(
            f"{out.name} changed while this session was open: another session or an editor "
            "wrote it. Nothing more was written; the answer you just gave is not in the file. "
            "Run the command again."
        )


def _append(out: Path, record: ReviewRecord) -> None:
    """Add one line, and make sure it is on disk before the next prompt."""
    out.parent.mkdir(parents=True, exist_ok=True)
    joined = out.exists() and out.read_bytes()[-1:] not in (b"", b"\n")
    with out.open("a", encoding="utf-8", newline="\n") as handle:
        if joined:
            handle.write("\n")
        handle.write(json.dumps(asdict(record), ensure_ascii=False) + "\n")
        handle.flush()
        os.fsync(handle.fileno())
