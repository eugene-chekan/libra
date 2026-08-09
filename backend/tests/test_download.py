"""Downloading the stored EPUB.

Nothing served book content before this endpoint, so the design's "Start
Reading" button had nothing to point at. There is no in-browser reader in any
phase — the Kindle, or whatever the reader already uses, is the reader.

The interesting surface is the response headers rather than the bytes. The
filename is rebuilt from the catalog instead of echoed from the uploader's
own, and the path still goes through `storage.resolve()`, which is what keeps
a caller-supplied `file_path` from reaching an arbitrary file.
"""

from pathlib import Path
from urllib.parse import unquote

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.models import Book
from tests.epub_factory import epub_bytes

_RFC5987 = "filename*=utf-8''"


def _disposition_filename(header: str) -> str:
    """Starlette always emits the RFC 5987 form, percent-encoded, rather than
    a bare `filename=`. Decoding it here keeps the assertions about the name
    rather than about the encoding."""
    assert _RFC5987 in header, header
    return unquote(header.split(_RFC5987, 1)[1])


def _upload(client: TestClient, tmp_path: Path, name: str = "dune.epub", **kwargs) -> dict:
    body = epub_bytes(tmp_path, **kwargs)
    return client.post("/books/upload", files={"file": (name, body, "application/epub+zip")}).json()


def test_downloading_returns_the_stored_bytes(
    client: TestClient, tmp_path: Path, library_dir: Path
) -> None:
    book = _upload(client, tmp_path)

    response = client.get(f"/books/{book['id']}/file")

    assert response.status_code == 200
    assert response.content == (library_dir / book["file_path"]).read_bytes()


def test_the_response_declares_epub(client: TestClient, tmp_path: Path) -> None:
    book = _upload(client, tmp_path)

    response = client.get(f"/books/{book['id']}/file")

    assert response.headers["content-type"] == "application/epub+zip"
    # The bytes are a user-supplied file served from an origin carrying a
    # session cookie, so the browser must not sniff its own conclusion.
    assert response.headers["x-content-type-options"] == "nosniff"


def test_the_response_is_privately_cacheable(client: TestClient, tmp_path: Path) -> None:
    """Every response here required a session; a shared cache handing one
    household member's book to another would be the bug."""
    book = _upload(client, tmp_path)

    response = client.get(f"/books/{book['id']}/file")

    assert "private" in response.headers["cache-control"]


def test_the_filename_comes_from_the_catalog_not_the_upload(
    client: TestClient, tmp_path: Path
) -> None:
    """The uploader chose `../../etc/passwd.epub`; the download is offered as
    the book's title and author. Storage already refuses to use the supplied
    name, and this is the other end of that rule — it must not come back out
    in a header either."""
    book = _upload(
        client,
        tmp_path,
        name="../../etc/passwd.epub",
        titles=["Dune"],
        creators=["Frank Herbert"],
    )

    response = client.get(f"/books/{book['id']}/file")

    disposition = response.headers["content-disposition"]
    assert "attachment" in disposition
    assert _disposition_filename(disposition) == "Dune - Frank Herbert.epub"
    assert "passwd" not in disposition


def test_a_non_ascii_title_survives_the_header(client: TestClient, tmp_path: Path) -> None:
    """`naming.book_filename` keeps non-ASCII rather than stripping it, on the
    grounds that the transport encodes it. This is the half that proves the
    transport actually does."""
    book = _upload(client, tmp_path, titles=["Война и мир"], creators=["Лев Толстой"])

    response = client.get(f"/books/{book['id']}/file")

    name = _disposition_filename(response.headers["content-disposition"])
    assert name == "Война и мир - Лев Толстой.epub"


def test_a_missing_book_is_404(client: TestClient) -> None:
    assert client.get("/books/9999/file").status_code == 404


def test_a_row_whose_file_vanished_is_404(
    client: TestClient, tmp_path: Path, library_dir: Path
) -> None:
    """A library that has drifted from its database — an unmounted volume, a
    file removed by hand. The reader gets a 404 rather than a stack trace."""
    book = _upload(client, tmp_path)
    (library_dir / book["file_path"]).unlink()

    assert client.get(f"/books/{book['id']}/file").status_code == 404


def test_a_file_path_escaping_the_library_is_404(
    client: TestClient, session: Session, library_dir: Path, tmp_path: Path
) -> None:
    """`POST /books` takes a caller-supplied `file_path`, so a row can point
    outside the library. `storage.resolve()` is the guard; this proves the
    download endpoint honours it instead of returning the file.

    The target is made to genuinely exist, so a passing test cannot be
    explained by the file being absent.
    """
    outside = tmp_path / "secret.epub"
    outside.write_bytes(b"not yours")
    library_dir.mkdir(parents=True, exist_ok=True)

    book = Book(
        title="Escape",
        author="Nobody",
        format="epub",
        file_path="../secret.epub",
        book_metadata={},
    )
    session.add(book)
    session.commit()
    session.refresh(book)

    response = client.get(f"/books/{book.id}/file")

    assert response.status_code == 404
    assert b"not yours" not in response.content


def test_any_reader_may_download_any_book(
    client: TestClient, other_client: TestClient, tmp_path: Path
) -> None:
    """The catalog is shared, so there is nothing to scope here — unlike
    notes or reading state. Worth pinning so a later change cannot quietly
    make the library private per-uploader."""
    book = _upload(client, tmp_path)

    assert other_client.get(f"/books/{book['id']}/file").status_code == 200


def test_downloading_requires_a_session(anon_client: TestClient) -> None:
    assert anon_client.get("/books/1/file").status_code == 401
