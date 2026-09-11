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

from app import covers, covers_from_url, storage
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


# --- a custom cover wins over the EPUB's --------------------------------------


def _book_with_custom_cover(session: Session, library_dir: Path) -> int:
    """A book row whose cover is a file this test wrote, not one from an EPUB."""
    relative, media_type = covers.store(io.BytesIO(PNG_BYTES), library_dir, max_bytes=1024)
    book = Book(
        title="Covered",
        author="A",
        format="epub",
        file_path="nothing.epub",
        book_metadata={"custom_cover_path": relative, "custom_cover_media_type": media_type},
    )
    session.add(book)
    session.commit()
    session.refresh(book)
    return book.id


def test_a_custom_cover_is_served(
    admin_client: TestClient, session: Session, library_dir: Path
) -> None:
    book_id = _book_with_custom_cover(session, library_dir)

    response = admin_client.get(f"/books/{book_id}/cover")

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content == PNG_BYTES


def test_a_custom_cover_makes_has_cover_true(
    admin_client: TestClient, session: Session, library_dir: Path
) -> None:
    """This is what unlocks the enlarge lightbox — the second report in #84."""
    book_id = _book_with_custom_cover(session, library_dir)

    assert admin_client.get(f"/books/{book_id}").json()["has_cover"] is True


def test_deleting_the_book_takes_its_custom_cover(
    admin_client: TestClient, session: Session, library_dir: Path
) -> None:
    book_id = _book_with_custom_cover(session, library_dir)
    relative = session.get(Book, book_id).book_metadata["custom_cover_path"]

    assert admin_client.delete(f"/books/{book_id}").status_code == 204
    assert not (library_dir / relative).exists()


# --- setting a cover through the endpoints ----------------------------------


def _plain_book(session: Session) -> int:
    """A book row with an empty `book_metadata` — no cover of any kind."""
    book = Book(title="Bare", author="A", format="epub", file_path="nothing.epub")
    session.add(book)
    session.commit()
    session.refresh(book)
    return book.id


def _book_with_epub_cover(session: Session, library_dir: Path) -> int:
    """A book whose stored EPUB really declares a cover of its own."""
    source = build_epub(library_dir.parent / "with-cover.epub", cover="epub3")
    meta = read_metadata(source, fallback_title="x")
    with source.open("rb") as stream:
        staged = storage.stage_upload(stream, library_dir, max_bytes=1_000_000)
    book = Book(
        title="Real",
        author="A",
        format="epub",
        file_path=storage.commit(staged, library_dir),
        book_metadata={
            "cover_href": meta.cover_href,
            "cover_media_type": meta.cover_media_type,
        },
    )
    session.add(book)
    session.commit()
    session.refresh(book)
    return book.id


def test_an_admin_can_upload_a_cover(admin_client: TestClient, session, library_dir) -> None:
    book_id = _plain_book(session)

    response = admin_client.put(
        f"/books/{book_id}/cover", files={"file": ("c.jpg", JPEG_BYTES, "image/jpeg")}
    )

    assert response.status_code == 200
    assert response.json()["has_cover"] is True
    assert admin_client.get(f"/books/{book_id}/cover").content == JPEG_BYTES


def test_a_reader_may_not_set_a_cover(client: TestClient, session) -> None:
    book_id = _plain_book(session)

    response = client.put(
        f"/books/{book_id}/cover", files={"file": ("c.jpg", JPEG_BYTES, "image/jpeg")}
    )

    assert response.status_code == 403


def test_an_upload_that_is_not_a_picture_is_refused(admin_client: TestClient, session) -> None:
    book_id = _plain_book(session)

    response = admin_client.put(
        f"/books/{book_id}/cover", files={"file": ("c.jpg", b"<html>", "image/jpeg")}
    )

    assert response.status_code == 415


def test_a_cover_can_be_set_from_a_link(monkeypatch, admin_client, session) -> None:
    monkeypatch.setattr("app.library.covers_from_url.fetch", lambda url, max_bytes: PNG_BYTES)
    book_id = _plain_book(session)

    response = admin_client.post(
        f"/books/{book_id}/cover/from-url", json={"url": "https://e/c.png"}
    )

    assert response.status_code == 200
    assert response.json()["has_cover"] is True


def test_a_link_inside_the_network_is_refused(
    monkeypatch, admin_client: TestClient, session
) -> None:
    """The address guard, not the scheme check: a well-formed https link whose
    host resolves to a private address is refused before any fetch."""
    monkeypatch.setattr("app.covers_from_url._resolve", lambda host: ["192.168.1.1"])
    book_id = _plain_book(session)

    response = admin_client.post(
        f"/books/{book_id}/cover/from-url", json={"url": "https://sneaky.example/c.jpg"}
    )

    assert response.status_code == 422


def test_a_reader_may_not_set_a_cover_from_a_link(client: TestClient, session) -> None:
    book_id = _plain_book(session)

    response = client.post(f"/books/{book_id}/cover/from-url", json={"url": "https://e/c.png"})

    assert response.status_code == 403


def test_deleting_the_custom_cover_brings_back_the_books_own(
    admin_client: TestClient, session, library_dir
) -> None:
    """The custom one shadows the EPUB's rather than replacing it."""
    book_id = _book_with_epub_cover(session, library_dir)
    admin_client.put(f"/books/{book_id}/cover", files={"file": ("c.jpg", JPEG_BYTES, "image/jpeg")})

    assert admin_client.delete(f"/books/{book_id}/cover").status_code == 200
    assert admin_client.get(f"/books/{book_id}/cover").content != JPEG_BYTES
    assert admin_client.get(f"/books/{book_id}").json()["has_cover"] is True


def test_replacing_a_cover_removes_the_file_it_replaced(
    admin_client: TestClient, session, library_dir
) -> None:
    book_id = _plain_book(session)
    admin_client.put(f"/books/{book_id}/cover", files={"file": ("c.jpg", JPEG_BYTES, "image/jpeg")})
    first = session.get(Book, book_id).book_metadata["custom_cover_path"]

    admin_client.put(f"/books/{book_id}/cover", files={"file": ("c.png", PNG_BYTES, "image/png")})

    session.expire_all()
    assert session.get(Book, book_id).book_metadata["custom_cover_path"] != first
    assert not (library_dir / first).exists()


def test_a_refused_link_leaves_the_existing_cover_in_place(
    monkeypatch, admin_client: TestClient, session, library_dir
) -> None:
    """set_cover_from_url fetches before it writes. A link that is refused
    after fetch has run must leave the cover already on the book untouched."""
    book_id = _plain_book(session)
    admin_client.put(f"/books/{book_id}/cover", files={"file": ("c.jpg", JPEG_BYTES, "image/jpeg")})

    def _refuse(url: str, max_bytes: int) -> bytes:
        raise covers_from_url.FetchFailedError("nope")

    monkeypatch.setattr("app.library.covers_from_url.fetch", _refuse)
    response = admin_client.post(
        f"/books/{book_id}/cover/from-url", json={"url": "https://e/c.png"}
    )

    assert 400 <= response.status_code < 500
    assert admin_client.get(f"/books/{book_id}/cover").content == JPEG_BYTES
    assert admin_client.get(f"/books/{book_id}").json()["has_cover"] is True


# --- a replaced cover is not hidden by the browser cache --------------------


def test_the_cover_response_is_revalidated_not_cached_for_a_day(
    client: TestClient, tmp_path: Path
) -> None:
    """`Cache-Control` is `private, no-cache`, not `max-age`.

    `no-cache` lets the browser store the image but forces it to revalidate
    against the ETag before every reuse. `max-age=86400` would instead let a
    replaced cover stay hidden for a day: the ETag moves on every write, but a
    browser only reads it on the revalidation that `max-age` suppresses.
    """
    book = _upload(client, tmp_path, cover="epub3")

    headers = client.get(f"/books/{book['id']}/cover").headers

    assert headers["cache-control"] == "private, no-cache"


def test_a_replaced_cover_is_served_at_once(admin_client: TestClient, session, library_dir) -> None:
    """Set a cover, replace it with different bytes, and the next GET returns
    the new bytes under the header that makes a real browser re-fetch them."""
    book_id = _plain_book(session)
    admin_client.put(f"/books/{book_id}/cover", files={"file": ("c.jpg", JPEG_BYTES, "image/jpeg")})
    assert admin_client.get(f"/books/{book_id}/cover").content == JPEG_BYTES

    admin_client.put(f"/books/{book_id}/cover", files={"file": ("c.png", PNG_BYTES, "image/png")})

    second = admin_client.get(f"/books/{book_id}/cover")
    assert second.content == PNG_BYTES
    assert second.headers["cache-control"] == "private, no-cache"


# --- the format list cannot drift out of step ------------------------------


def test_every_accepted_media_type_has_a_stored_suffix() -> None:
    """`covers.store` does `SUFFIXES[media_type]`, so a type accepted by
    `COVER_MEDIA_TYPES` with no entry here would be a 500. Pin them equal."""
    assert set(covers.SUFFIXES) == COVER_MEDIA_TYPES


# --- the old cover file outlives a commit that fails -----------------------


def test_a_failed_commit_leaves_the_previous_cover_file_on_disk(
    monkeypatch, admin_client: TestClient, session: Session, library_dir: Path
) -> None:
    """The replaced file is removed only after the commit that dropped the row's
    reference to it. If that commit fails the metadata rolls back to the old
    path, so the file it names must still be there — otherwise the book shows a
    broken image for good."""
    book_id = _plain_book(session)
    admin_client.put(f"/books/{book_id}/cover", files={"file": ("c.jpg", JPEG_BYTES, "image/jpeg")})
    first = session.get(Book, book_id).book_metadata["custom_cover_path"]

    def _locked() -> None:
        raise RuntimeError("database is locked")

    monkeypatch.setattr(session, "commit", _locked)

    with pytest.raises(RuntimeError, match="database is locked"):
        admin_client.put(
            f"/books/{book_id}/cover", files={"file": ("c.png", PNG_BYTES, "image/png")}
        )

    assert (library_dir / first).exists()


# --- the cover's version: which picture the cover is (#124) ---


def _version(client: TestClient, book_id: int) -> str | None:
    body = client.get(f"/books/{book_id}").json()
    assert "cover_version" in body
    return body["cover_version"]


def test_a_book_with_no_cover_has_no_version(admin_client: TestClient, session) -> None:
    book_id = _plain_book(session)

    assert _version(admin_client, book_id) is None


def test_the_version_is_the_same_on_every_read(
    admin_client: TestClient, session, library_dir
) -> None:
    # A version that moved on every read would put a new address in every <img>, and the
    # browser would download every cover again on every page.
    book_id = _book_with_epub_cover(session, library_dir)

    first = _version(admin_client, book_id)

    assert first is not None
    assert _version(admin_client, book_id) == first


def test_replacing_a_cover_changes_its_version(admin_client: TestClient, session) -> None:
    book_id = _plain_book(session)
    admin_client.put(f"/books/{book_id}/cover", files={"file": ("a.jpg", JPEG_BYTES, "image/jpeg")})
    first = _version(admin_client, book_id)

    admin_client.put(f"/books/{book_id}/cover", files={"file": ("b.png", PNG_BYTES, "image/png")})

    assert first is not None
    assert _version(admin_client, book_id) not in (None, first)


def test_clearing_back_to_the_books_own_cover_changes_its_version(
    admin_client: TestClient, session, library_dir
) -> None:
    # has_cover stays true the whole time, because the EPUB has a cover of its own. Only the
    # version can tell the client that the picture changed back.
    book_id = _book_with_epub_cover(session, library_dir)
    own = _version(admin_client, book_id)
    admin_client.put(f"/books/{book_id}/cover", files={"file": ("a.jpg", JPEG_BYTES, "image/jpeg")})
    custom = _version(admin_client, book_id)

    admin_client.delete(f"/books/{book_id}/cover")

    assert own is not None
    assert custom not in (None, own)
    assert _version(admin_client, book_id) == own


def test_has_cover_is_true_exactly_when_there_is_a_version(
    admin_client: TestClient, session, library_dir
) -> None:
    books = (
        _plain_book(session),
        _book_with_epub_cover(session, library_dir),
        _book_with_custom_cover(session, library_dir),
    )

    for book_id in books:
        body = admin_client.get(f"/books/{book_id}").json()
        assert body["has_cover"] is (body.get("cover_version") is not None)
