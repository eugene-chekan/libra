"""The checked sample (protocol section 11, check 3): the chunks methods find, judged by hand."""

import json
import random
from collections.abc import Callable
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path

from sqlmodel import Session

from app.models import Book, Chunk
from rag.corpus import CorpusBook, CorpusError
from rag.descriptors import append_log, read_log
from rag.embeddings import Embedder
from rag.evaluate import Question
from rag.index import indexed_chunks
from rag.questions import QuestionRecord, used_questions
from rag.search import METHODS, DescriptorIndex, VectorIndex, search

CHECKED_SEED = "checked-v1"
CHECKED_QUESTIONS = 50
POOL_DEPTH = 5
SOURCE_PROMPT = "Press Enter to judge the chunks found for it (q = quit): "
RELEVANT_PROMPT = "Relevant? (y = it answers the question, n = it does not, q = quit): "
_ANSWERS = {"y": True, "n": False}


def sample_questions(sets: dict[str, list[QuestionRecord]]) -> list[tuple[str, QuestionRecord]]:
    """The checked sample: `CHECKED_QUESTIONS` used questions of all sets, with their set.

    The seed `CHECKED_SEED` makes the sample the same on every machine.

    Raises:
        CorpusError: The sets hold fewer used questions than that.
    """
    used = sorted(
        ((name, record) for name, records in sets.items() for record in used_questions(records)),
        key=lambda pair: pair[1].id,
    )
    if len(used) < CHECKED_QUESTIONS:
        raise CorpusError(
            f"{len(used)} used questions; the checked sample needs {CHECKED_QUESTIONS}"
        )
    return random.Random(CHECKED_SEED).sample(used, CHECKED_QUESTIONS)


def build_pool(
    session: Session,
    books: list[CorpusBook],
    vectors: VectorIndex,
    descriptors: DescriptorIndex,
    model: Embedder,
    questions: list[Question],
) -> list[dict]:
    """The first `POOL_DEPTH` chunks of every method for every question: one line each.

    Each method ranks as in the run, at the protocol's depth, so a fused method fuses the
    same lists; only its first `POOL_DEPTH` are kept.
    """
    file_of = {book.sha256: book.file for book in books}
    places: dict[int, dict] = {}

    def place(chunk_id: int) -> dict:
        if chunk_id not in places:
            chunk = session.get(Chunk, chunk_id)
            sha256 = session.get(Book, chunk.book_id).book_metadata["sha256"]
            places[chunk_id] = {
                "file": file_of[sha256],
                "book_sha256": sha256,
                "position": chunk.position,
                "chunker_version": chunk.chunker_version,
            }
        return places[chunk_id]

    lines = []
    for question in questions:
        source = {f"source_{key}": value for key, value in place(question.source_chunk_id).items()}
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
            for rank, chunk_id in enumerate(ranking[:POOL_DEPTH], start=1):
                lines.append(
                    {
                        "question": question.id,
                        "set": question.set,
                        "genre": question.genre,
                        "kind": question.kind,
                        "text": question.text,
                        **source,
                        "method": method,
                        "rank": rank,
                        **place(chunk_id),
                        "is_source": chunk_id == question.source_chunk_id,
                    }
                )
    return lines


def write_pool(out: Path, lines: list[dict]) -> None:
    """Write the pool, one JSON line each; a pool is never written over.

    Raises:
        CorpusError: `out` exists.
    """
    if out.exists():
        raise CorpusError(f"{out} exists; a pool is never written over")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        "".join(json.dumps(line, ensure_ascii=False) + "\n" for line in lines),
        encoding="utf-8",
        newline="\n",
    )


def to_judge(pool: list[dict]) -> list[tuple[dict, list[dict]]]:
    """Each question in pool order, with the found chunks the judge sees.

    The source chunk is not judged, and a chunk found by several methods is judged once.
    The chunks are shuffled, with a seed per question, so their order shows no method.
    """
    firsts: dict[str, dict] = {}
    found: dict[str, dict[tuple[str, int], dict]] = {}
    for line in pool:
        firsts.setdefault(line["question"], line)
        mine = found.setdefault(line["question"], {})
        if not line["is_source"]:
            mine.setdefault((line["book_sha256"], line["position"]), line)
    work = []
    for question, first in firsts.items():
        chunks = sorted(
            found[question].values(), key=lambda line: (line["book_sha256"], line["position"])
        )
        random.Random(f"{CHECKED_SEED}:{question}").shuffle(chunks)
        work.append((first, chunks))
    return work


@dataclass(frozen=True)
class Judgement:
    """One line of the judgement file: is one found chunk relevant to one question?"""

    question: str
    file: str
    book_sha256: str
    position: int
    chunker_version: int
    relevant: bool
    judged_at: str


def read_judgements(path: Path) -> list[Judgement]:
    """Read and check the judgement file; a file that does not exist yet holds none.

    Raises:
        CorpusError: A line is not a valid judgement, naming its number.
    """
    if not path.exists():
        return []
    records: list[Judgement] = []
    seen: set[tuple[str, str, int]] = set()
    with path.open(encoding="utf-8") as handle:
        for number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                record = Judgement(**json.loads(line))
            except (ValueError, TypeError) as exc:
                raise CorpusError(f"{path.name} line {number}: not a judgement ({exc})") from exc
            key = (record.question, record.book_sha256, record.position)
            if key in seen:
                raise CorpusError(f"{path.name} line {number}: this chunk is judged twice")
            if not isinstance(record.relevant, bool):
                raise CorpusError(f"{path.name} line {number}: relevant is not true or false")
            seen.add(key)
            records.append(record)
    return records


def run_judging(
    session: Session,
    books: list[CorpusBook],
    pool_path: Path,
    out: Path,
    ask: Callable[[str], str],
    show: Callable[[str], None],
    today: date,
) -> int:
    """Show each found chunk not yet judged, and record whether it is relevant.

    Args:
        session: Open session on the indexed experiment database.
        books: From `read_corpus`.
        pool_path: The pool from `rag judge-pool`.
        out: The judgement file. Judgements already there are kept, and judging resumes.
        ask: Shows a prompt and returns what the author typed.
        show: Prints a screen.
        today: Written into each judgement.

    Returns:
        How many chunks were judged in this session.

    Raises:
        CorpusError: The pool is empty, a chunk is not stored, a line of `out` is not a
            valid judgement, or `out` changed during the session.
    """
    pool = read_log(pool_path)
    if not pool:
        raise CorpusError(f"{pool_path} holds no pool; run rag judge-pool first")
    records = read_judgements(out)
    done = {(r.question, r.book_sha256, r.position) for r in records}
    by_sha = {book.sha256: book for book in books}
    texts: dict[str, dict[int, Chunk]] = {}

    def chunk_of(sha256: str, position: int, version: int) -> tuple[CorpusBook, Chunk]:
        book = by_sha.get(sha256)
        if book is None:
            raise CorpusError(f"a book of the pool is not in corpus.csv ({sha256[:12]})")
        if sha256 not in texts:
            texts[sha256] = {chunk.position: chunk for chunk in indexed_chunks(session, book)}
        chunk = texts[sha256].get(position)
        if chunk is None or chunk.chunker_version != version:
            raise CorpusError(f"{book.file}: chunk {position} of the pool is not stored")
        return book, chunk

    work = to_judge(pool)
    total = sum(len(chunks) for _, chunks in work)
    judged = 0
    for number, (question, chunks) in enumerate(work, start=1):
        left = [
            c for c in chunks if (question["question"], c["book_sha256"], c["position"]) not in done
        ]
        if not left:
            continue
        book, source = chunk_of(
            question["source_book_sha256"],
            question["source_position"],
            question["source_chunker_version"],
        )
        show(_source_screen(number, len(work), question, book, source))
        if ask(SOURCE_PROMPT).strip().lower() == "q":
            return judged
        for line in left:
            book, chunk = chunk_of(line["book_sha256"], line["position"], line["chunker_version"])
            show(_found_screen(len(records), total, number, len(work), question, book, chunk))
            answer = _ask_until(ask, RELEVANT_PROMPT, lambda a: a.lower() in (*_ANSWERS, "q"))
            if answer.lower() == "q":
                return judged
            record = Judgement(
                question=question["question"],
                file=book.file,
                book_sha256=line["book_sha256"],
                position=line["position"],
                chunker_version=line["chunker_version"],
                relevant=_ANSWERS[answer.lower()],
                judged_at=today.isoformat(),
            )
            _refuse_a_changed_file(out, records)
            append_log(out, asdict(record))
            records.append(record)
            judged += 1
    show(f"All {total} found chunks are judged.")
    return judged


def _ask_until(ask: Callable[[str], str], prompt: str, accept: Callable[[str], bool]) -> str:
    while True:
        answer = ask(prompt).strip()
        if accept(answer):
            return answer


def _chapter(chunk: Chunk) -> str:
    return chunk.chapter_title or "(no title)"


def _source_screen(
    number: int, questions: int, question: dict, book: CorpusBook, chunk: Chunk
) -> str:
    return "\n".join(
        [
            "",
            f"Question {number}/{questions} ({question['set']}, {question['genre']}, "
            f"{question['kind']})",
            f"Question: {question['text']}",
            "",
            f"The chunk it was written on: {book.title}, chapter {_chapter(chunk)}",
            "",
            chunk.text,
            "",
        ]
    )


def _found_screen(
    judged: int,
    total: int,
    number: int,
    questions: int,
    question: dict,
    book: CorpusBook,
    chunk: Chunk,
) -> str:
    return "\n".join(
        [
            "",
            f"{judged}/{total} judged. Question {number}/{questions}.",
            f"A found chunk: {book.title}, chapter {_chapter(chunk)}",
            "",
            chunk.text,
            "",
            f"Question: {question['text']}",
            "Relevant means: this chunk alone lets a reader answer the question.",
            "",
        ]
    )


def _refuse_a_changed_file(out: Path, records: list[Judgement]) -> None:
    """Stop before writing when `out` no longer holds what this session expects.

    Raises:
        CorpusError: The file changed while the session was open.
    """
    try:
        on_disk = read_judgements(out)
    except CorpusError:
        on_disk = []
    if on_disk != records:
        raise CorpusError(
            f"{out.name} changed while this session was open: another session or an editor "
            "wrote it. Nothing more was written; the answer you just gave is not in the file. "
            "Run the command again."
        )
