"""The corpus list: its checks, its rules, and loading it into the experiment database."""

import csv
import dataclasses
import hashlib
from collections.abc import Generator
from pathlib import Path
from types import SimpleNamespace

import pytest
from sqlmodel import Session, select

from app import library
from app.cli import main
from app.config import Settings, get_settings
from app.db import get_engine, run_migrations
from app.models import Book
from rag.chunking import CHUNKER_VERSION, MAX_TOKENS, chunk_book, chunks_digest
from rag.corpus import (
    CSV_FIELDS,
    MAX_BOOK_WORDS,
    MAX_GENRE_GAP,
    TEST_BOOKS_PER_GENRE,
    BookStats,
    CorpusBook,
    CorpusError,
    book_stats,
    broken_rules,
    genre_gap,
    load_corpus,
    read_corpus,
    verify_files,
)
from tests.epub_factory import Chapter, build_epub


def words_as_tokens(text: str) -> int:
    return len(text.split())


def make_book(folder: Path, name: str, words: int) -> Path:
    body = "<p>" + " ".join(f"w{i}" for i in range(words)) + "</p>"
    return build_epub(folder / name, titles=[name], chapters=[Chapter("one.xhtml", body)])


def row(path: Path, genre: str = "fiction", role: str = "test") -> dict:
    return {
        "file": path.name,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "title": path.stem,
        "author": "An Author",
        "genre": genre,
        "role": role,
        "link": "https://standardebooks.org/ebooks/an-author/a-book",
    }


def write_csv(path: Path, rows: list[dict], *, bom: bool = False) -> Path:
    with path.open("w", encoding="utf-8-sig" if bom else "utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_FIELDS, lineterminator="\r\n")
        writer.writeheader()
        writer.writerows(rows)
    return path


def stats_for(genre: str, role: str, words: int) -> BookStats:
    book = CorpusBook("x.epub", "0" * 64, "T", "A", genre, role, "")
    return BookStats(
        book=book, words=words, chunks=1, max_tokens=MAX_TOKENS, short_chunks=0, chunks_sha256=""
    )


def balanced(fiction_words: int = 1000, non_fiction_words: int = 1000) -> list[BookStats]:
    return [stats_for("fiction", "test", fiction_words)] * TEST_BOOKS_PER_GENRE + [
        stats_for("non-fiction", "test", non_fiction_words)
    ] * TEST_BOOKS_PER_GENRE


def test_a_spreadsheet_saved_list_is_read(tmp_path: Path) -> None:
    path = make_book(tmp_path / "files", "a.epub", 10)
    corpus = write_csv(tmp_path / "corpus.csv", [row(path)], bom=True)

    [book] = read_corpus(corpus)

    assert (book.file, book.genre, book.role) == ("a.epub", "fiction", "test")


@pytest.mark.parametrize(
    "field, value",
    [("genre", "poetry"), ("role", "spare"), ("file", "../a.epub"), ("sha256", "abc")],
)
def test_a_bad_value_is_refused(tmp_path: Path, field: str, value: str) -> None:
    path = make_book(tmp_path, "a.epub", 10)
    corpus = write_csv(tmp_path / "corpus.csv", [{**row(path), field: value}])

    with pytest.raises(CorpusError):
        read_corpus(corpus)


def test_a_repeated_file_is_refused(tmp_path: Path) -> None:
    path = make_book(tmp_path, "a.epub", 10)
    corpus = write_csv(tmp_path / "corpus.csv", [row(path), row(path)])

    with pytest.raises(CorpusError, match="more than once"):
        read_corpus(corpus)


def test_missing_and_changed_files_are_both_named(tmp_path: Path) -> None:
    folder = tmp_path / "files"
    changed = make_book(folder, "changed.epub", 10)
    books = [CorpusBook(**row(changed)), CorpusBook(**{**row(changed), "file": "gone.epub"})]
    changed.write_bytes(changed.read_bytes() + b"x")

    with pytest.raises(CorpusError) as caught:
        verify_files(books, folder)

    assert "gone.epub" in str(caught.value)
    assert "changed.epub" in str(caught.value)


def test_loading_adds_each_test_book_once(
    session: Session, settings: Settings, tmp_path: Path
) -> None:
    folder = tmp_path / "files"
    books = [CorpusBook(**row(make_book(folder, f"{name}.epub", 10))) for name in "ab"]

    assert load_corpus(session, books, folder, settings) == 2
    assert load_corpus(session, books, folder, settings) == 0

    stored = session.exec(select(Book)).all()
    assert sorted(b.book_metadata["sha256"] for b in stored) == sorted(b.sha256 for b in books)
    assert {b.uploaded_by for b in stored} == {None}


def test_pilot_books_are_not_loaded(session: Session, settings: Settings, tmp_path: Path) -> None:
    folder = tmp_path / "files"
    pilot = CorpusBook(**row(make_book(folder, "pilot.epub", 10), role="pilot"))

    assert load_corpus(session, [pilot], folder, settings) == 0
    assert session.exec(select(Book)).all() == []


def test_a_database_with_other_books_is_refused(
    session: Session, settings: Settings, tmp_path: Path
) -> None:
    mine = make_book(tmp_path / "elsewhere", "mine.epub", 10)
    with mine.open("rb") as source:
        library.add_book_from_file(session, source, "mine.epub", settings, uploaded_by=None)
    folder = tmp_path / "files"
    books = [CorpusBook(**row(make_book(folder, "a.epub", 10)))]

    with pytest.raises(CorpusError, match="not in corpus.csv"):
        load_corpus(session, books, folder, settings)

    assert len(session.exec(select(Book)).all()) == 1


def test_stats_count_the_chunker_s_words(tmp_path: Path) -> None:
    folder = tmp_path / "files"
    books = [CorpusBook(**row(make_book(folder, "a.epub", 600)))]

    [stats] = book_stats(books, folder, words_as_tokens)

    assert stats.words == 600
    assert stats.chunks >= 2
    assert stats.max_tokens <= MAX_TOKENS


def test_a_balanced_corpus_breaks_no_rule() -> None:
    assert broken_rules([*balanced(), stats_for("fiction", "pilot", 90_000)]) == []


def test_the_gap_limit_itself_is_allowed() -> None:
    stats = balanced(fiction_words=1100, non_fiction_words=1000)

    assert genre_gap(stats) == pytest.approx(MAX_GENRE_GAP)
    assert broken_rules(stats) == []


def test_genres_further_apart_than_the_limit_break_a_rule() -> None:
    stats = balanced(fiction_words=1200, non_fiction_words=1000)

    assert genre_gap(stats) > MAX_GENRE_GAP
    assert any("differ" in problem for problem in broken_rules(stats))


def test_a_missing_test_book_breaks_a_rule() -> None:
    problems = broken_rules(balanced()[1:])

    assert any(f"{TEST_BOOKS_PER_GENRE - 1} fiction" in problem for problem in problems)


def test_an_oversized_chunk_breaks_a_rule() -> None:
    stats = balanced()
    stats[0] = dataclasses.replace(stats[0], max_tokens=MAX_TOKENS + 1)

    assert any("tokens" in problem for problem in broken_rules(stats))


@pytest.fixture(name="experiment_db")
def experiment_db_fixture(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Generator[None, None, None]:
    """A fresh database and library, as `rag load-corpus` meets them the first time."""
    monkeypatch.setenv("LIBRA_DATABASE_URL", f"sqlite:///{tmp_path / 'experiment.db'}")
    monkeypatch.setenv("LIBRA_LIBRARY_DIR", str(tmp_path / "library"))
    get_settings.cache_clear()
    get_engine.cache_clear()
    yield
    get_engine().dispose()
    get_settings.cache_clear()
    get_engine.cache_clear()


def test_load_corpus_reports_what_it_added(
    experiment_db: None, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    folder = tmp_path / "files"
    corpus = write_csv(tmp_path / "corpus.csv", [row(make_book(folder, "a.epub", 10))])

    assert main(["rag", "load-corpus", str(corpus), str(folder)]) == 0
    assert main(["rag", "load-corpus", str(corpus), str(folder)]) == 0

    out = capsys.readouterr().out
    assert "Added 1 of 1" in out
    assert "Added 0 of 1" in out


def test_corpus_stats_writes_a_row_per_book(
    experiment_db: None,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    folder = tmp_path / "files"
    corpus = write_csv(tmp_path / "corpus.csv", [row(make_book(folder, "a.epub", 10))])
    fake_model = SimpleNamespace(token_count=words_as_tokens)
    monkeypatch.setattr("rag.embeddings.load_model", lambda settings: fake_model)
    out = tmp_path / "stats.csv"

    code = main(["rag", "corpus-stats", str(corpus), str(folder), "--out", str(out)])

    [stats_row] = list(csv.DictReader(out.open(encoding="utf-8")))
    assert stats_row["words"] == "10"
    assert stats_row["chunker_version"] == str(CHUNKER_VERSION)
    assert stats_row["chunks_sha256"] == chunks_digest(
        chunk_book(folder / "a.epub", words_as_tokens)
    )
    assert code == 1
    assert "rule broken" in capsys.readouterr().err


def test_a_book_over_the_word_limit_breaks_a_rule() -> None:
    stats = balanced()
    stats[0] = dataclasses.replace(stats[0], words=MAX_BOOK_WORDS + 1)

    assert any(f"over {MAX_BOOK_WORDS}" in problem for problem in broken_rules(stats))


def test_load_corpus_refuses_a_real_library_before_migrating_it(
    experiment_db: None,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    run_migrations()
    mine = make_book(tmp_path / "elsewhere", "mine.epub", 10)
    with Session(get_engine()) as session, mine.open("rb") as source:
        library.add_book_from_file(session, source, "mine.epub", get_settings(), uploaded_by=None)

    def refuse_to_migrate() -> None:
        raise AssertionError("migrated a database it should have refused")

    monkeypatch.setattr("app.cli.run_migrations", refuse_to_migrate)
    folder = tmp_path / "files"
    corpus = write_csv(tmp_path / "corpus.csv", [row(make_book(folder, "a.epub", 10))])

    assert main(["rag", "load-corpus", str(corpus), str(folder)]) == 1
    assert "not in corpus.csv" in capsys.readouterr().err
