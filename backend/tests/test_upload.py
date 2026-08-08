from pathlib import Path

from fastapi.testclient import TestClient

from app.models import User
from tests.epub_factory import build_epub, epub_bytes


def _upload(client: TestClient, content: bytes, name: str = "dune.epub"):
    return client.post(
        "/books/upload",
        files={"file": (name, content, "application/epub+zip")},
    )


def test_upload_creates_book_from_parsed_metadata(
    client: TestClient, tmp_path: Path, library_dir: Path
) -> None:
    response = _upload(client, epub_bytes(tmp_path))
    assert response.status_code == 201

    body = response.json()
    assert body["title"] == "Dune"
    assert body["author"] == "Frank Herbert"
    assert body["format"] == "epub"
    assert body["book_metadata"]["language"] == "en"
    assert body["book_metadata"]["original_filename"] == "dune.epub"

    # The row points at a real file, stored under a generated name.
    stored = library_dir / body["file_path"]
    assert stored.is_file()
    assert stored.name != "dune.epub"
    assert body["book_metadata"]["size_bytes"] == stored.stat().st_size


def test_uploaded_book_is_listed_and_fetchable(client: TestClient, tmp_path: Path) -> None:
    created = _upload(client, epub_bytes(tmp_path)).json()

    assert client.get("/books").json()["total"] == 1
    assert client.get(f"/books/{created['id']}").json()["title"] == "Dune"


def test_upload_falls_back_to_filename_for_untitled_book(
    client: TestClient, tmp_path: Path
) -> None:
    content = epub_bytes(tmp_path, name="untitled.epub", titles=[], creators=[])
    body = _upload(client, content, name="Some Book Name.epub").json()

    assert body["title"] == "Some Book Name"
    assert body["author"] == "Unknown"


def test_upload_records_sha256_for_later_ingestion(client: TestClient, tmp_path: Path) -> None:
    import hashlib

    content = epub_bytes(tmp_path)
    body = _upload(client, content).json()

    assert body["book_metadata"]["sha256"] == hashlib.sha256(content).hexdigest()


def test_upload_rejects_non_epub_extension(client: TestClient) -> None:
    response = _upload(client, b"whatever", name="book.mobi")
    assert response.status_code == 415


def test_upload_rejects_invalid_epub(client: TestClient) -> None:
    response = _upload(client, b"not a zip at all")
    assert response.status_code == 422
    assert "Invalid EPUB" in response.json()["detail"]


def test_rejected_upload_leaves_no_file_behind(client: TestClient, library_dir: Path) -> None:
    """A malformed upload must not litter the library with staged temp files."""
    assert _upload(client, b"not a zip at all").status_code == 422

    leftovers = list(library_dir.iterdir()) if library_dir.exists() else []
    assert leftovers == []


def test_upload_size_limit_admits_normal_books_and_rejects_larger_ones(
    client: TestClient, tmp_path: Path, settings
) -> None:
    """Pin the limit between two real fixtures so it has to discriminate.

    A limit below every EPUB would make the 413 assertion pass for the wrong
    reason, so the threshold is derived from the smaller file's actual size.
    """
    small = epub_bytes(tmp_path, name="small.epub")
    large = build_epub(tmp_path / "large.epub", description="x" * 8192).read_bytes()
    assert len(small) < len(large)

    settings.max_upload_bytes = len(small)

    assert _upload(client, small, name="small.epub").status_code == 201
    assert _upload(client, large, name="large.epub").status_code == 413


def test_oversized_upload_leaves_no_file_behind(
    client: TestClient, tmp_path: Path, settings, library_dir: Path
) -> None:
    large = build_epub(tmp_path / "large.epub", description="x" * 8192).read_bytes()
    settings.max_upload_bytes = len(large) // 2

    assert _upload(client, large, name="large.epub").status_code == 413
    assert list(library_dir.iterdir()) == []


def test_upload_stores_the_parsed_catalog_fields(
    client: TestClient, tmp_path: Path, user: User
) -> None:
    """epub.py returning these proves nothing about the row the router writes."""
    body = epub_bytes(tmp_path, published="1965-08-01", pages="412")

    data = _upload(client, body).json()

    assert data["year"] == 1965
    assert data["pages"] == 412
    assert data["blurb"] == "Desert planet politics."
    assert data["uploaded_by"] == user.id
    # The raw date stays in the blob; the description does not.
    assert data["book_metadata"]["published"] == "1965-08-01"
    assert "description" not in data["book_metadata"]


def test_upload_leaves_pages_null_when_undeclared(client: TestClient, tmp_path: Path) -> None:
    """The common real-world case: almost no EPUB declares a page count."""
    assert _upload(client, epub_bytes(tmp_path)).json()["pages"] is None


def test_delete_removes_the_stored_file(
    admin_client: TestClient, tmp_path: Path, library_dir: Path
) -> None:
    created = _upload(admin_client, epub_bytes(tmp_path)).json()
    stored = library_dir / created["file_path"]
    assert stored.is_file()

    assert admin_client.delete(f"/books/{created['id']}").status_code == 204
    assert not stored.exists()


def test_delete_tolerates_a_row_with_no_file_on_disk(
    admin_client: TestClient, library_dir: Path
) -> None:
    """Rows created via POST /books reference a path we never wrote."""
    created = admin_client.post(
        "/books",
        json={
            "title": "Manual",
            "author": "A",
            "format": "epub",
            "file_path": "nothing-here.epub",
            "book_metadata": {},
        },
    ).json()

    assert admin_client.delete(f"/books/{created['id']}").status_code == 204
    assert admin_client.get(f"/books/{created['id']}").status_code == 404


def test_delete_ignores_a_path_escaping_the_library(
    admin_client: TestClient, tmp_path: Path, library_dir: Path
) -> None:
    """A traversal path in file_path must not delete anything outside the library."""
    outsider = tmp_path / "precious.txt"
    outsider.write_text("do not delete me")
    library_dir.mkdir(parents=True, exist_ok=True)

    created = admin_client.post(
        "/books",
        json={
            "title": "Evil",
            "author": "A",
            "format": "epub",
            "file_path": "../precious.txt",
            "book_metadata": {},
        },
    ).json()

    assert admin_client.delete(f"/books/{created['id']}").status_code == 204
    assert outsider.exists()
