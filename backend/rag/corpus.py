"""The experiment's book list: reading it, checking its files and rules, loading it."""

import csv
import hashlib
import re
from collections.abc import Callable
from dataclasses import dataclass, fields
from pathlib import Path

from sqlalchemy import func
from sqlmodel import Session, select

from app import library
from app.config import Settings
from app.epub import InvalidEpubError
from app.models import Book
from rag.chunking import (
    CHUNKER_VERSION,
    MAX_TOKENS,
    SHORT_CHUNK_WORDS,
    TextChunk,
    chunk_book,
    chunks_digest,
)

GENRES = ("fiction", "non-fiction")
ROLES = ("test", "pilot")
TEST_BOOKS_PER_GENRE = 20
# A bigger genre has more wrong passages to compete with, and that alone would
# lower its scores.
MAX_GENRE_GAP = 0.10
MAX_BOOK_WORDS = 200_000

_SHA256 = re.compile(r"[0-9a-f]{64}")


class CorpusError(Exception):
    """The book list or its files are not what the experiment needs."""


@dataclass(frozen=True)
class CorpusBook:
    """One row of corpus.csv."""

    file: str
    sha256: str
    title: str
    author: str
    genre: str
    role: str
    link: str


@dataclass(frozen=True)
class BookStats:
    """What the chunker makes of one corpus book."""

    book: CorpusBook
    words: int
    chunks: int
    max_tokens: int
    short_chunks: int
    # Changes when the chunks change, even with the same CHUNKER_VERSION: a different
    # tokenizer moves the boundaries.
    chunks_sha256: str


CSV_FIELDS = [field.name for field in fields(CorpusBook)]
STATS_FIELDS = [
    "file",
    "genre",
    "role",
    "words",
    "chunks",
    "max_tokens",
    "short_chunks",
    "chunker_version",
    "chunks_sha256",
]


def read_corpus(csv_path: Path) -> list[CorpusBook]:
    """Read and check corpus.csv.

    Args:
        csv_path: The list. A byte-order mark from a spreadsheet is fine.

    Raises:
        CorpusError: A column is missing, a value is not allowed, or a file or hash repeats.
    """
    with csv_path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        missing = set(CSV_FIELDS) - set(reader.fieldnames or [])
        if missing:
            raise CorpusError(f"corpus.csv lacks the columns: {', '.join(sorted(missing))}")
        books = [
            CorpusBook(**{name: (row[name] or "").strip() for name in CSV_FIELDS}) for row in reader
        ]

    problems = []
    for book in books:
        if book.genre not in GENRES:
            problems.append(f"{book.file}: genre {book.genre!r} is not one of {GENRES}")
        if book.role not in ROLES:
            problems.append(f"{book.file}: role {book.role!r} is not one of {ROLES}")
        if not book.file or Path(book.file).name != book.file:
            problems.append(f"{book.file!r}: the file must be a plain name inside the folder")
        if not _SHA256.fullmatch(book.sha256):
            problems.append(f"{book.file}: sha256 is not 64 lowercase hex digits")
    for name in ("file", "sha256"):
        values = [getattr(book, name) for book in books]
        repeated = sorted({value for value in values if values.count(value) > 1})
        problems += [f"{name} {value!r} appears more than once" for value in repeated]
    if problems:
        raise CorpusError("; ".join(problems))
    return books


def verify_files(books: list[CorpusBook], folder: Path) -> None:
    """Check every listed file is present and unchanged.

    Raises:
        CorpusError: Naming every missing file and every file whose sha256 differs.
    """
    problems = []
    for book in books:
        path = folder / book.file
        if not path.is_file():
            problems.append(f"{book.file}: missing from {folder}")
            continue
        with path.open("rb") as handle:
            if hashlib.file_digest(handle, "sha256").hexdigest() != book.sha256:
                problems.append(f"{book.file}: its sha256 differs from corpus.csv")
    if problems:
        raise CorpusError("; ".join(problems))


def refuse_foreign_books(session: Session, books: list[CorpusBook]) -> set[str]:
    """Check the database holds no book but the corpus test books; return the hashes it holds.

    Raises:
        CorpusError: It holds another book, so it is somebody's library and not the
            experiment's.
    """
    listed = {book.sha256 for book in books if book.role == "test"}
    held = set(session.exec(select(func.json_extract(Book.book_metadata, "$.sha256"))).all())
    foreign = held - listed
    if foreign:
        raise CorpusError(
            f"the database holds {len(foreign)} book(s) not in corpus.csv; "
            "point LIBRA_DATABASE_URL at the experiment's own database"
        )
    return held


def load_corpus(session: Session, books: list[CorpusBook], folder: Path, settings: Settings) -> int:
    """Add every test book the database does not hold yet. Pilot books stay out of it.

    Args:
        session: Open session on the experiment database.
        books: From `read_corpus`.
        folder: Holds the files corpus.csv names.
        settings: Supplies the library directory the books are stored in.

    Returns:
        How many books were added.

    Raises:
        CorpusError: A file is missing or changed, or the database holds a book that is
            not in the list, which means it is somebody's library and not the experiment's.
    """
    tests = [book for book in books if book.role == "test"]
    verify_files(tests, folder)
    held = refuse_foreign_books(session, books)

    added = 0
    for book in tests:
        if book.sha256 in held:
            continue
        with (folder / book.file).open("rb") as source:
            library.add_book_from_file(session, source, book.file, settings, uploaded_by=None)
        added += 1
    return added


def book_stats(
    books: list[CorpusBook], folder: Path, count_tokens: Callable[[str], int]
) -> list[BookStats]:
    """Chunk every listed book, pilot books too.

    Raises:
        CorpusError: A file is missing, changed, or not a usable EPUB.
    """
    verify_files(books, folder)
    stats = []
    for book in books:
        try:
            chunks = chunk_book(folder / book.file, count_tokens)
        except InvalidEpubError as exc:
            raise CorpusError(f"{book.file}: {exc}") from exc
        stats.append(
            BookStats(
                book=book,
                words=sum(chunk.word_count for chunk in chunks),
                chunks=len(chunks),
                max_tokens=max((chunk.token_count for chunk in chunks), default=0),
                short_chunks=sum(1 for chunk in chunks if chunk.word_count < SHORT_CHUNK_WORDS),
                chunks_sha256=chunks_digest(chunks),
            )
        )
    return stats


def genre_words(stats: list[BookStats]) -> dict[str, int]:
    """Total words of the test books in each genre."""
    return {
        genre: sum(s.words for s in stats if s.book.role == "test" and s.book.genre == genre)
        for genre in GENRES
    }


def genre_gap(stats: list[BookStats]) -> float:
    """How far the larger genre's test words exceed the smaller's, as a share of the smaller."""
    totals = genre_words(stats).values()
    smaller, larger = min(totals), max(totals)
    return (larger - smaller) / smaller if smaller else float("inf")


def broken_rules(stats: list[BookStats]) -> list[str]:
    """Every corpus rule the stats break, as plain sentences; empty when all hold."""
    problems = []
    for genre in GENRES:
        count = sum(1 for s in stats if s.book.role == "test" and s.book.genre == genre)
        if count != TEST_BOOKS_PER_GENRE:
            problems.append(f"{count} {genre} test books, not {TEST_BOOKS_PER_GENRE}")
    if genre_gap(stats) > MAX_GENRE_GAP:
        problems.append(
            f"the genres' word totals differ by more than {MAX_GENRE_GAP:.0%}: {genre_words(stats)}"
        )
    problems += [
        f"{s.book.file}: {s.words} words, over {MAX_BOOK_WORDS}"
        for s in stats
        if s.words > MAX_BOOK_WORDS
    ]
    problems += [
        f"{s.book.file}: a chunk of {s.max_tokens} tokens, over {MAX_TOKENS}"
        for s in stats
        if s.max_tokens > MAX_TOKENS
    ]
    return problems


def read_digests(stats_csv: Path) -> dict[str, str]:
    """Read the frozen `chunks_sha256` of every book in corpus-stats.csv, by file name.

    Raises:
        CorpusError: A column is missing.
    """
    with stats_csv.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        missing = set(STATS_FIELDS) - set(reader.fieldnames or [])
        if missing:
            raise CorpusError(f"{stats_csv.name} lacks the columns: {', '.join(sorted(missing))}")
        return {line["file"]: line["chunks_sha256"] for line in reader}


def frozen_chunks(
    path: Path, file: str, count_tokens: Callable[[str], int], digests: dict[str, str]
) -> list[TextChunk]:
    """Chunk a corpus book, and check the chunks are the frozen ones.

    Args:
        path: The EPUB on disk.
        file: Its name in corpus.csv.
        count_tokens: The embedding model's token count for a text.
        digests: From `read_digests`.

    Raises:
        CorpusError: The book has no frozen digest, it is not a usable EPUB, or its chunks
            differ from the digest.
    """
    if file not in digests:
        raise CorpusError(
            f"{file}: corpus-stats.csv has no chunks_sha256 for it, so its chunks cannot be "
            f"checked against chunker version {CHUNKER_VERSION}"
        )
    try:
        chunks = chunk_book(path, count_tokens)
    except InvalidEpubError as exc:
        raise CorpusError(f"{file}: {exc}") from exc
    if chunks_digest(chunks) != digests[file]:
        raise CorpusError(
            f"{file}: its chunks differ from chunker version {CHUNKER_VERSION} as frozen in "
            "corpus-stats.csv; the tokenizer is most likely different (see experiment/README.md)"
        )
    return chunks


def write_stats(stats: list[BookStats], out: Path) -> None:
    """Write one row per book, with the chunker version that produced it."""
    with out.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=STATS_FIELDS)
        writer.writeheader()
        for s in stats:
            writer.writerow(
                {
                    "file": s.book.file,
                    "genre": s.book.genre,
                    "role": s.book.role,
                    "words": s.words,
                    "chunks": s.chunks,
                    "max_tokens": s.max_tokens,
                    "short_chunks": s.short_chunks,
                    "chunker_version": CHUNKER_VERSION,
                    "chunks_sha256": s.chunks_sha256,
                }
            )
