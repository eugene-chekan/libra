"""The full run: every method over every question, and the files a run writes."""

import csv
import hashlib
import json
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
from sqlalchemy import func
from sqlmodel import Session, select

from app.models import Book, Chunk
from rag.chunking import CHUNKER_VERSION, chunks_digest
from rag.corpus import CorpusBook, CorpusError
from rag.descriptors import PROMPT_VERSION, QUESTION_DESCRIPTORS, logged_descriptors
from rag.embeddings import Embedder, embed_passages
from rag.index import indexed_chunks
from rag.metrics import K_VALUES, MRR_K, mrr_at, rank_of, recall_at
from rag.questions import HandRecord
from rag.search import DEPTH, METHODS, DescriptorIndex, VectorIndex, search

PROTOCOL_VERSION = "v1"
GENRES = ("fiction", "non-fiction")


@dataclass(frozen=True)
class Question:
    """One test question, its source chunk, and its descriptor vectors."""

    id: str
    set: str
    genre: str
    kind: str
    text: str
    source_chunk_id: int
    # One unit row per valid descriptor, no prefix; no rows when its answer failed.
    descriptor_vectors: np.ndarray


def check_stored_chunks(session: Session, books: list[CorpusBook], digests: dict[str, str]) -> None:
    """Refuse a database whose stored chunks differ from the frozen ones.

    Raises:
        CorpusError: A test book is not indexed, has no frozen digest, or its stored chunk
            texts do not match it.
    """
    for book in books:
        if book.role != "test":
            continue
        if book.file not in digests:
            raise CorpusError(f"{book.file}: corpus-stats.csv has no chunks_sha256 for it")
        if chunks_digest(indexed_chunks(session, book)) != digests[book.file]:
            raise CorpusError(f"{book.file}: the stored chunks differ from corpus-stats.csv")


def load_questions(
    session: Session,
    records: list[HandRecord],
    query_log: list[dict],
    model: Embedder,
    question_set: str,
) -> list[Question]:
    """The kept questions of a set, each matched to its source chunk and its descriptors.

    Args:
        session: Open session on the indexed experiment database.
        records: From `read_records`; skipped chunks are left out.
        query_log: From `read_log` on the question descriptor log.
        model: The embedding model.
        question_set: The set's name in the results, such as "hand".

    Raises:
        CorpusError: A question's source chunk is not stored, or it has no entry in
            `query_log`, or its entry is for another text.
    """
    logged = {
        entry["id"]: entry
        for entry in query_log
        if entry["kind"] == "question" and entry["prompt_version"] == PROMPT_VERSION
    }
    questions = []
    for record in records:
        if record.status != "kept" or record.question is None or record.kind is None:
            continue
        entry = logged.get(record.id)
        if entry is None:
            raise CorpusError(f"{record.id}: no question descriptors; run describe-questions")
        if entry["question"] != record.question:
            raise CorpusError(f"{record.id}: the descriptor log has another text for it")
        descriptors = logged_descriptors(entry, QUESTION_DESCRIPTORS) or []
        vectors = embed_passages(model, descriptors) if descriptors else np.empty((0, 0))
        questions.append(
            Question(
                id=record.id,
                set=question_set,
                genre=record.genre,
                kind=record.kind,
                text=record.question,
                source_chunk_id=_source_chunk(session, record),
                descriptor_vectors=vectors,
            )
        )
    return questions


def _source_chunk(session: Session, record: HandRecord) -> int:
    chunk_id = session.exec(
        select(Chunk.id)
        .join(Book, Book.id == Chunk.book_id)
        .where(
            func.json_extract(Book.book_metadata, "$.sha256") == record.book_sha256,
            Chunk.position == record.position,
            Chunk.chunker_version == record.chunker_version,
        )
    ).first()
    if chunk_id is None or record.chunker_version != CHUNKER_VERSION:
        raise CorpusError(f"{record.id}: its source chunk is not stored; is the book indexed?")
    return chunk_id


def rank_questions(
    session: Session,
    vectors: VectorIndex,
    descriptors: DescriptorIndex,
    model: Embedder,
    questions: list[Question],
    progress: Callable[[str], None] | None = None,
) -> list[dict]:
    """The rank of each question's source chunk by each method: one row per pair.

    A rank is None when the source chunk is not in the method's first `DEPTH`.
    """
    rows = []
    for number, question in enumerate(questions, start=1):
        for method in METHODS:
            ranking = search(
                session,
                vectors,
                model,
                question.text,
                method,
                descriptors=descriptors,
                query_descriptors=question.descriptor_vectors,
            )
            rows.append(
                {
                    "question": question.id,
                    "set": question.set,
                    "genre": question.genre,
                    "kind": question.kind,
                    "method": method,
                    "rank": rank_of(ranking, question.source_chunk_id),
                }
            )
        if progress:
            progress(f"{number}/{len(questions)} {question.id}")
    return rows


def summarize(rows: list[dict]) -> list[dict]:
    """recall@k and MRR for each method, over all questions and for each genre."""
    summary = []
    for method in METHODS:
        mine = [row for row in rows if row["method"] == method]
        for genre in ("all", *GENRES):
            ranks = [row["rank"] for row in mine if genre == "all" or row["genre"] == genre]
            if not ranks:
                continue
            line = {"method": method, "genre": genre, "questions": len(ranks)}
            for k in K_VALUES:
                line[f"recall@{k}"] = round(recall_at(ranks, k), 4)
            line[f"mrr@{MRR_K}"] = round(mrr_at(ranks, MRR_K), 4)
            summary.append(line)
    return summary


def require_new_run(out: Path) -> None:
    """Refuse a run folder that exists: a run never writes over another.

    Raises:
        CorpusError: `out` exists.
    """
    if out.exists():
        raise CorpusError(f"{out} exists; a run never writes over another")


def write_run(
    out: Path, rows: list[dict], summary: list[dict], inputs: dict[str, Path], facts: dict
) -> None:
    """Write `ranks.csv`, `summary.csv`, `summary.md` and `run.json` into a new folder.

    Args:
        out: The run folder. It must not exist yet.
        rows: From `rank_questions`.
        summary: From `summarize`.
        inputs: Each input file by its name in `run.json`; their sha256 is recorded.
        facts: More keys for `run.json`, such as the git commit.

    Raises:
        CorpusError: `out` exists already.
    """
    require_new_run(out)
    out.mkdir(parents=True)
    _write_csv(out / "ranks.csv", rows)
    _write_csv(out / "summary.csv", summary)
    (out / "summary.md").write_text(_markdown(summary), encoding="utf-8", newline="\n")
    run = {
        "protocol": PROTOCOL_VERSION,
        "prompt_version": PROMPT_VERSION,
        "chunker_version": CHUNKER_VERSION,
        "depth": DEPTH,
        "methods": list(METHODS),
        "questions": len({row["question"] for row in rows}),
        "created_at": datetime.now(UTC).isoformat(timespec="seconds"),
        **facts,
        "sha256": {name: _sha256(path) for name, path in inputs.items()},
    }
    (out / "run.json").write_text(json.dumps(run, indent=2) + "\n", encoding="utf-8", newline="\n")


def _write_csv(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]), lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def _markdown(summary: list[dict]) -> str:
    columns = list(summary[0])
    lines = [
        "| " + " | ".join(columns) + " |",
        "|" + "---|" * len(columns),
        *("| " + " | ".join(str(line[c]) for c in columns) + " |" for line in summary),
    ]
    return "\n".join(lines) + "\n"


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()
