"""Checks 1, 2 and 4 of protocol section 11, written into a run folder beside its scores."""

import csv
import json
import statistics
from pathlib import Path

from sqlmodel import Session

from rag.corpus import CorpusBook, CorpusError
from rag.descriptors import (
    CHUNK_DESCRIPTORS,
    PROMPT_VERSION,
    QUESTION_DESCRIPTORS,
    logged_descriptors,
)
from rag.drafts import words
from rag.evaluate import GENRES, QUESTION_SETS, file_sha256, source_chunk
from rag.metrics import recall_at
from rag.questions import QuestionRecord, used_questions
from rag.report import MAIN_K, read_ranks
from rag.search import METHODS

CHECKS_FILE = "checks.md"


def require_run_inputs(run: Path, inputs: dict[str, Path]) -> None:
    """Refuse input files that differ from the ones the run was made from.

    Args:
        run: A run folder written by `rag evaluate`.
        inputs: Each input file by its name in `run.json`.

    Raises:
        CorpusError: The run has no `run.json`, or a file's sha256 differs from it.
    """
    path = run / "run.json"
    if not path.exists():
        raise CorpusError(f"{path} does not exist; run rag evaluate first")
    recorded = json.loads(path.read_text(encoding="utf-8"))["sha256"]
    for name, file in inputs.items():
        if recorded.get(name) != file_sha256(file):
            raise CorpusError(f"{file} is not the {name} this run was made from")


def method_orders(rows: list[dict]) -> dict[str, list[tuple[str, float]]]:
    """Check 1: each set's methods from the best recall@MAIN_K to the worst.

    A tie keeps the order of `METHODS`.
    """
    orders = {}
    for name in QUESTION_SETS:
        mine = [row for row in rows if row["set"] == name]
        if not mine:
            continue
        scored = [
            (method, recall_at([row["rank"] for row in mine if row["method"] == method], MAIN_K))
            for method in METHODS
        ]
        orders[name] = sorted(scored, key=lambda pair: -pair[1])
    return orders


def _straight(text: str) -> str:
    return text.replace("’", "'")


def overlap(question: str, chunk_text: str) -> float:
    """Check 2: the share of the question's distinct words that are also in the chunk.

    Words are counted as in the 4-word check. A curly apostrophe counts as a straight one.
    """
    asked = set(words(_straight(question)))
    present = set(words(_straight(chunk_text)))
    return len(asked & present) / len(asked) if asked else 0.0


def overlap_lines(session: Session, sets: dict[str, list[QuestionRecord]]) -> list[dict]:
    """Check 2 for each used question of each set, against its stored source chunk.

    Raises:
        CorpusError: A question's source chunk is not stored.
    """
    return [
        {
            "question": record.id,
            "set": name,
            "genre": record.genre,
            "kind": record.kind,
            "overlap": round(overlap(record.question, source_chunk(session, record).text), 4),
        }
        for name, records in sets.items()
        for record in used_questions(records)
    ]


def overlap_summary(lines: list[dict]) -> list[dict]:
    """The mean and median overlap by set and genre, and over all of each."""
    summary = []
    for name in ("all", *QUESTION_SETS):
        for genre in ("all", *GENRES):
            values = [
                line["overlap"]
                for line in lines
                if name in ("all", line["set"]) and genre in ("all", line["genre"])
            ]
            if values:
                summary.append(
                    {
                        "set": name,
                        "genre": genre,
                        "questions": len(values),
                        "mean": round(statistics.mean(values), 3),
                        "median": round(statistics.median(values), 3),
                    }
                )
    return summary


def descriptor_failures(
    books: list[CorpusBook],
    chunk_log: list[dict],
    query_log: list[dict],
    records: list[QuestionRecord],
) -> list[dict]:
    """Check 4: how many test chunks and used questions got no valid descriptors.

    `first check` counts the answers that failed the check of the day they arrived;
    `failed` counts those that fail the check of today (protocol v1, deviation 1). A later
    entry for the same chunk or question replaces an earlier one.
    """
    genre_of = {book.file: book.genre for book in books if book.role == "test"}
    chunks = {
        (entry["file"], entry["position"]): entry
        for entry in chunk_log
        if entry["kind"] == "chunk"
        and entry["prompt_version"] == PROMPT_VERSION
        and entry["file"] in genre_of
    }
    used = {record.id: record for record in used_questions(records)}
    questions = {
        entry["id"]: entry
        for entry in query_log
        if entry["kind"] == "question"
        and entry["prompt_version"] == PROMPT_VERSION
        and entry["id"] in used
    }
    groups = [
        ("chunks", CHUNK_DESCRIPTORS, [(genre_of[f], e) for (f, _), e in chunks.items()]),
        (
            "questions",
            QUESTION_DESCRIPTORS,
            [(used[id_].genre, e) for id_, e in questions.items()],
        ),
    ]
    lines = []
    for what, count, entries in groups:
        for genre in ("all", *GENRES):
            mine = [entry for g, entry in entries if genre in ("all", g)]
            lines.append(
                {
                    "what": what,
                    "genre": genre,
                    "total": len(mine),
                    "first check": sum(1 for entry in mine if entry["status"] != "ok"),
                    "failed": sum(1 for entry in mine if logged_descriptors(entry, count) is None),
                }
            )
    return lines


def check_run(
    session: Session,
    books: list[CorpusBook],
    run: Path,
    sets: dict[str, list[QuestionRecord]],
    chunk_log: list[dict],
    query_log: list[dict],
) -> None:
    """Write checks 1, 2 and 4 into a run folder.

    Args:
        session: Open session on the indexed experiment database.
        books: From `read_corpus`.
        run: A run folder written by `rag evaluate`.
        sets: Each set's hand or review records, by set name; only used ones are checked.
        chunk_log: The chunk descriptor log, from `read_log`.
        query_log: The question descriptor log, from `read_log`.

    Raises:
        CorpusError: The run has no ranks.csv, it has checks already, or a source chunk
            is not stored.
    """
    rows = read_ranks(run / "ranks.csv")
    if (run / CHECKS_FILE).exists():
        raise CorpusError(f"{run} has checks already; checks never write over others")
    orders = method_orders(rows)
    lines = overlap_lines(session, sets)
    summary = overlap_summary(lines)
    records = [record for records in sets.values() for record in records]
    failures = descriptor_failures(books, chunk_log, query_log, records)
    _write_csv(
        run / "orders.csv",
        [
            {"set": name, "place": place, "method": method, f"recall@{MAIN_K}": round(value, 4)}
            for name, order in orders.items()
            for place, (method, value) in enumerate(order, start=1)
        ],
    )
    _write_csv(run / "overlap.csv", lines)
    _write_csv(run / "failures.csv", failures)
    (run / CHECKS_FILE).write_text(
        _markdown(orders, summary, failures), encoding="utf-8", newline="\n"
    )


def _write_csv(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]), lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def _table(rows: list[dict]) -> list[str]:
    columns = list(rows[0])
    return [
        "| " + " | ".join(columns) + " |",
        "|" + "---|" * len(columns),
        *("| " + " | ".join(str(row[c]) for c in columns) + " |" for row in rows),
    ]


def _markdown(
    orders: dict[str, list[tuple[str, float]]], summary: list[dict], failures: list[dict]
) -> str:
    places = []
    for place in range(len(METHODS)):
        row: dict = {"place": place + 1}
        for name, order in orders.items():
            method, value = order[place]
            row[name] = method
            row[f"{name} recall@{MAIN_K}"] = f"{value:.3f}"
        places.append(row)
    same = len({tuple(method for method, _ in order) for order in orders.values()}) == 1
    lines = [
        "# Checks",
        "",
        "Protocol section 11, checks 1, 2 and 4. Checks 3, 5 and 6 need a person's",
        "judgement and are not here.",
        "",
        "## 1. Hand set vs drafted set",
        "",
        f"Each set's methods, from the best recall@{MAIN_K} to the worst. A tie keeps the",
        "protocol's order of methods.",
        "",
        *_table(places),
        "",
        f"Both sets order the methods the same way: {'yes' if same else 'no'}.",
        "",
        "## 2. Word overlap",
        "",
        "The share of a question's distinct words that are also in its source chunk.",
        "Words are counted as in the 4-word check, in lower case. A curly apostrophe counts",
        'as a straight one. Common words such as "the" count too. One value per question',
        "is in overlap.csv.",
        "",
        *_table(summary),
        "",
        "## 4. Descriptor failures",
        "",
        "A chunk or a question fails when its answer gives no valid descriptors.",
        '"first check" counts the answers that failed the 2-6 word check when they arrived;',
        '"failed" counts those that fail the 1-8 word check of deviation 1, which the run',
        "used. A failed chunk is never found by descriptors; a failed question gets no",
        "descriptor ranking.",
        "",
        *_table(failures),
        "",
    ]
    return "\n".join(lines)
