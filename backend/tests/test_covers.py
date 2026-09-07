"""Cover art: finding it in the EPUB, and serving it without opening a hole.

The bytes come from a file a user uploaded and are served from the API's own
origin — which carries a session cookie. The media-type allowlist is what
stops that being stored XSS, so it gets a test of its own and a hand mutation.
"""

import io
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app import covers, storage
from app.covers import SNIFF_BYTES, sniff_media_type
from app.epub import read_metadata
from app.models import COVER_MEDIA_TYPES, Book
from tests.epub_factory import build_epub, epub_bytes

PNG = b"\x89PNG\r\n\x1a\n fake image data"


def _upload(client: TestClient, tmp_path: Path, **kwargs) -> dict:
    body = epub_bytes(tmp_path, **kwargs)
    return client.post(
        "/books/upload", files={"file": ("dune.epub", body, "application/epub+zip")}
    ).json()


# --- finding it -----------------------------------------------------------


@pytest.mark.parametrize("style", ["epub3", "epub2"])
def test_finds_the_cover_in_either_epub_generation(tmp_path: Path, style: str) -> None:
    """EPUB 3 marks a manifest item `properties="cover-image"`; EPUB 2 points
    at one with `<meta name="cover">`. Both are common in real libraries."""
    meta = read_metadata(build_epub(tmp_path / "c.epub", cover=style), fallback_title="c")

    # Resolved against the OPF's directory, which defaults to OEBPS/.
    assert meta.cover_href == "OEBPS/images/cover.png"
    assert meta.cover_media_type == "image/png"


def test_no_cover_declared_is_not_an_error(tmp_path: Path) -> None:
    meta = read_metadata(build_epub(tmp_path / "n.epub"), fallback_title="n")

    assert meta.cover_href is None
    assert meta.cover_media_type is None


def test_the_href_resolves_against_a_nested_opf(tmp_path: Path) -> None:
    """The manifest href is relative to the OPF, not the zip root, and real
    EPUBs put the OPF in a subdirectory."""
    path = build_epub(tmp_path / "deep.epub", cover="epub3", opf_path="a/b/package.opf")

    assert read_metadata(path, fallback_title="d").cover_href == "a/b/images/cover.png"


def test_an_epub2_meta_pointing_at_nothing_is_ignored(tmp_path: Path) -> None:
    """A dangling `content` id must not crash the parse."""
    path = build_epub(
        tmp_path / "dangling.epub",
        extra_meta=['<meta name="cover" content="does-not-exist"/>'],
    )

    assert read_metadata(path, fallback_title="x").cover_href is None


# --- serving it -----------------------------------------------------------


def test_a_cover_is_served_with_its_bytes_and_type(client: TestClient, tmp_path: Path) -> None:
    book = _upload(client, tmp_path, cover="epub3")

    response = client.get(f"/books/{book['id']}/cover")

    assert response.status_code == 200
    assert response.content == PNG
    assert response.headers["content-type"] == "image/png"


def test_the_response_carries_its_safety_headers(client: TestClient, tmp_path: Path) -> None:
    book = _upload(client, tmp_path, cover="epub3")

    headers = client.get(f"/books/{book['id']}/cover").headers

    # nosniff, because an allowlist a browser is free to overrule is not one.
    assert headers["x-content-type-options"] == "nosniff"
    # `private`: responses need a session, so a shared cache must never hand
    # one household member's request to another.
    assert "private" in headers["cache-control"]
    assert headers["etag"]


def test_has_cover_tells_the_client_not_to_ask(client: TestClient, tmp_path: Path) -> None:
    """A twelve-cell grid should not fire twelve requests that 404."""
    with_cover = _upload(client, tmp_path, cover="epub3")
    without = _upload(client, tmp_path / "b", cover=None)

    assert with_cover["has_cover"] is True
    assert without["has_cover"] is False
    assert client.get("/books").json()["items"][0]["has_cover"] in (True, False)


def test_a_book_without_a_cover_is_404(client: TestClient, tmp_path: Path) -> None:
    book = _upload(client, tmp_path)

    assert client.get(f"/books/{book['id']}/cover").status_code == 404


def test_an_unknown_book_is_404(client: TestClient) -> None:
    assert client.get("/books/999/cover").status_code == 404


def test_the_cover_endpoint_requires_a_session(anon_client: TestClient) -> None:
    assert anon_client.get("/books/1/cover").status_code == 401


# --- the hole this closes -------------------------------------------------


def test_a_cover_declared_as_html_is_refused(client: TestClient, tmp_path: Path) -> None:
    """The reason the allowlist exists.

    Serving `text/html` out of a user-uploaded archive, from the origin that
    holds the session cookie, is stored XSS. Treated as "no cover" rather than
    given its own status code — a caller cannot act on the difference, and the
    real reason is server-side detail.
    """
    book = _upload(client, tmp_path, cover="epub3", cover_media_type="text/html")

    assert book["has_cover"] is False
    assert client.get(f"/books/{book['id']}/cover").status_code == 404


@pytest.mark.parametrize(
    "media_type",
    ["text/html", "image/svg+xml", "application/javascript", "text/plain", ""],
)
def test_only_raster_image_types_are_served(
    client: TestClient, tmp_path: Path, media_type: str
) -> None:
    """SVG is excluded deliberately: it is a document format that can carry
    script, so it is not safe simply because its name starts with `image/`."""
    book = _upload(client, tmp_path, cover="epub3", cover_media_type=media_type)

    assert client.get(f"/books/{book['id']}/cover").status_code == 404


def test_a_declared_cover_missing_from_the_archive_is_404(
    client: TestClient, session: Session, tmp_path: Path
) -> None:
    """A manifest can promise an image the archive does not contain.

    Rewriting the stored href is the only way to reach this: the factory
    always writes the member it declares, and a real file can be inconsistent
    in ways a generator will not reproduce.
    """
    book_id = _upload(client, tmp_path, cover="epub3")["id"]

    row = session.get(Book, book_id)
    row.book_metadata = {**row.book_metadata, "cover_href": "OEBPS/images/gone.png"}
    session.add(row)
    session.commit()

    # Still advertised, because the manifest still declares one...
    assert client.get(f"/books/{book_id}").json()["has_cover"] is True
    # ...but reading it fails cleanly rather than 500ing.
    assert client.get(f"/books/{book_id}/cover").status_code == 404


# --- sniff media type from bytes -------------------------------------------


JPEG_BYTES = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00"
PNG_BYTES = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
GIF_BYTES = b"GIF89a\x01\x00\x01\x00"
WEBP_BYTES = b"RIFF\x24\x00\x00\x00WEBPVP8 "


@pytest.mark.parametrize(
    ("head", "expected"),
    [
        (JPEG_BYTES, "image/jpeg"),
        (PNG_BYTES, "image/png"),
        (GIF_BYTES, "image/gif"),
        (WEBP_BYTES, "image/webp"),
    ],
)
def test_a_real_image_is_recognised(head: bytes, expected: str) -> None:
    assert sniff_media_type(head) == expected
    assert sniff_media_type(head) in COVER_MEDIA_TYPES


@pytest.mark.parametrize(
    "head",
    [
        b"",
        b"\xff\xd8",  # A JPEG's first two bytes, and nothing more.
        b"<!DOCTYPE html><html>",  # What a server returns when it means 404.
        b"%PDF-1.7",
        b"RIFF\x24\x00\x00\x00AVI LIST",  # A RIFF container that is not WebP.
    ],
)
def test_anything_else_is_not_a_cover(head: bytes) -> None:
    assert sniff_media_type(head) is None


def test_enough_bytes_are_read_to_decide_webp() -> None:
    """WebP's marker sits at offset 8, further in than the other three."""
    assert SNIFF_BYTES >= 12


# --- storing a custom cover ----------------------------------------------


def test_a_stored_cover_lands_in_the_covers_subdirectory(tmp_path: Path) -> None:
    relative, media_type = covers.store(io.BytesIO(JPEG_BYTES), tmp_path, max_bytes=1024)

    assert relative.startswith(f"{covers.COVERS_SUBDIR}/")
    assert relative.endswith(".jpg")
    assert media_type == "image/jpeg"
    assert (tmp_path / relative).read_bytes() == JPEG_BYTES


def test_the_covers_directory_is_not_the_library_root(tmp_path: Path) -> None:
    """`maintenance.report` calls any file in the root that no book points at an
    orphan and offers to delete it. A cover in the root would be taken."""
    covers.store(io.BytesIO(JPEG_BYTES), tmp_path, max_bytes=1024)

    assert [path.name for path in tmp_path.iterdir() if path.is_file()] == []


def test_something_that_is_not_a_picture_is_refused(tmp_path: Path) -> None:
    with pytest.raises(covers.NotAnImageError):
        covers.store(io.BytesIO(b"<!DOCTYPE html>"), tmp_path, max_bytes=1024)


def test_a_refused_cover_leaves_nothing_behind(tmp_path: Path) -> None:
    with pytest.raises(covers.NotAnImageError):
        covers.store(io.BytesIO(b"<!DOCTYPE html>"), tmp_path, max_bytes=1024)

    assert list((tmp_path / covers.COVERS_SUBDIR).glob("*")) == []


def test_a_cover_over_the_ceiling_is_refused(tmp_path: Path) -> None:
    with pytest.raises(storage.UploadTooLargeError):
        covers.store(io.BytesIO(JPEG_BYTES + b"\x00" * 500), tmp_path, max_bytes=64)


def test_removing_a_cover_takes_the_file(tmp_path: Path) -> None:
    relative, _ = covers.store(io.BytesIO(PNG_BYTES), tmp_path, max_bytes=1024)

    assert covers.remove(relative, tmp_path) is True
    assert not (tmp_path / relative).exists()


def test_a_path_that_climbs_out_of_the_library_is_refused(tmp_path: Path) -> None:
    assert covers.remove("../escape.jpg", tmp_path) is False
