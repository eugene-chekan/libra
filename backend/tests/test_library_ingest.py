"""Adding a book from a file outside a request: the path `rag load-corpus` takes."""

import hashlib
from pathlib import Path

import pytest
from sqlmodel import Session

from app import library, storage
from app.config import Settings
from app.epub import InvalidEpubError
from tests.epub_factory import build_epub


def stored_files(settings: Settings) -> list[Path]:
    return [path for path in settings.library_dir.rglob("*") if path.is_file()]


def test_a_book_added_from_a_file_has_no_uploader(
    session: Session, settings: Settings, tmp_path: Path
) -> None:
    path = build_epub(tmp_path / "dune.epub")

    with path.open("rb") as source:
        book = library.add_book_from_file(session, source, "dune.epub", settings, uploaded_by=None)

    assert book.id is not None
    assert book.uploaded_by is None
    assert book.title == "Dune"
    assert book.book_metadata["sha256"] == hashlib.sha256(path.read_bytes()).hexdigest()
    assert storage.resolve(book.file_path, settings.library_dir).is_file()


def test_a_name_without_the_epub_suffix_is_refused(
    session: Session, settings: Settings, tmp_path: Path
) -> None:
    path = build_epub(tmp_path / "dune.epub")

    with path.open("rb") as source, pytest.raises(library.UnsupportedFormatError):
        library.add_book_from_file(session, source, "dune.pdf", settings, uploaded_by=None)

    assert stored_files(settings) == []


def test_an_invalid_epub_leaves_nothing_behind(
    session: Session, settings: Settings, tmp_path: Path
) -> None:
    path = tmp_path / "broken.epub"
    path.write_bytes(b"not a zip")

    with path.open("rb") as source, pytest.raises(InvalidEpubError):
        library.add_book_from_file(session, source, "broken.epub", settings, uploaded_by=None)

    assert stored_files(settings) == []
