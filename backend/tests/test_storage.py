import hashlib
import io
from pathlib import Path

import pytest

from app import storage
from app.storage import UploadTooLargeError


def test_stage_upload_hashes_and_sizes_the_stream(tmp_path: Path) -> None:
    payload = b"a book's worth of bytes" * 100
    staged = storage.stage_upload(io.BytesIO(payload), tmp_path, max_bytes=1_000_000)

    assert staged.size_bytes == len(payload)
    assert staged.sha256 == hashlib.sha256(payload).hexdigest()
    assert staged.path.read_bytes() == payload


def test_stage_upload_aborts_past_the_ceiling(tmp_path: Path) -> None:
    with pytest.raises(UploadTooLargeError):
        storage.stage_upload(io.BytesIO(b"x" * 5000), tmp_path, max_bytes=1000)

    # The partial file is cleaned up rather than left as a .part orphan.
    assert list(tmp_path.iterdir()) == []


def test_commit_moves_to_a_generated_name(tmp_path: Path) -> None:
    staged = storage.stage_upload(io.BytesIO(b"content"), tmp_path, max_bytes=1000)
    stored_name = storage.commit(staged, tmp_path)

    assert stored_name.endswith(".epub")
    assert not staged.path.exists()
    assert (tmp_path / stored_name).read_bytes() == b"content"


def test_commit_generates_distinct_names_for_identical_content(tmp_path: Path) -> None:
    first = storage.commit(
        storage.stage_upload(io.BytesIO(b"same"), tmp_path, max_bytes=1000), tmp_path
    )
    second = storage.commit(
        storage.stage_upload(io.BytesIO(b"same"), tmp_path, max_bytes=1000), tmp_path
    )
    assert first != second


def test_resolve_accepts_a_name_inside_the_library(tmp_path: Path) -> None:
    assert storage.resolve("book.epub", tmp_path) == (tmp_path / "book.epub").resolve()


@pytest.mark.parametrize(
    "hostile",
    [
        "../outside.txt",
        "../../outside.txt",
        "sub/../../outside.txt",
    ],
)
def test_resolve_rejects_paths_escaping_the_library(tmp_path: Path, hostile: str) -> None:
    library = tmp_path / "library"
    library.mkdir()

    with pytest.raises(ValueError, match="escapes the library"):
        storage.resolve(hostile, library)


def test_resolve_rejects_an_absolute_path_outside_the_library(tmp_path: Path) -> None:
    """An absolute path would otherwise win the / join outright."""
    library = tmp_path / "library"
    library.mkdir()
    outsider = tmp_path / "passwd"
    outsider.write_text("secret")

    with pytest.raises(ValueError, match="escapes the library"):
        storage.resolve(str(outsider), library)


def test_delete_removes_a_stored_file(tmp_path: Path) -> None:
    target = tmp_path / "book.epub"
    target.write_bytes(b"content")

    assert storage.delete("book.epub", tmp_path) is True
    assert not target.exists()


def test_delete_reports_false_for_a_missing_file(tmp_path: Path) -> None:
    assert storage.delete("absent.epub", tmp_path) is False


def test_delete_refuses_to_touch_files_outside_the_library(tmp_path: Path) -> None:
    library = tmp_path / "library"
    library.mkdir()
    outsider = tmp_path / "precious.txt"
    outsider.write_text("do not delete me")

    assert storage.delete("../precious.txt", library) is False
    assert outsider.exists()
