"""PATCH /books/{id} — correcting shared catalog metadata.

Every test here uses `admin_client`: title and author describe the book
itself, so a correction changes what the whole household sees, which makes
editing them an admin action. The ordinary-user side of that boundary is
covered in test_permissions.py.
"""

from pathlib import Path

from fastapi.testclient import TestClient

from tests.epub_factory import epub_bytes

BOOK_PAYLOAD = {
    "title": "Dune",
    "author": "Frank Herbert",
    "format": "epub",
    "file_path": "dune.epub",
    "book_metadata": {"language": "en"},
}


def test_patch_corrects_a_single_field(admin_client: TestClient) -> None:
    created = admin_client.post("/books", json=BOOK_PAYLOAD).json()

    response = admin_client.patch(f"/books/{created['id']}", json={"author": "F. Herbert"})
    assert response.status_code == 200

    body = response.json()
    assert body["author"] == "F. Herbert"
    assert body["title"] == "Dune"  # untouched


def test_patch_leaves_omitted_fields_alone(admin_client: TestClient) -> None:
    created = admin_client.post("/books", json=BOOK_PAYLOAD).json()
    admin_client.patch(f"/books/{created['id']}", json={"title": "Dune (1965)"})

    body = admin_client.get(f"/books/{created['id']}").json()
    assert body["title"] == "Dune (1965)"
    assert body["author"] == "Frank Herbert"
    assert body["book_metadata"] == {"language": "en"}


def test_patch_replaces_metadata_wholesale(admin_client: TestClient) -> None:
    created = admin_client.post("/books", json=BOOK_PAYLOAD).json()

    response = admin_client.patch(
        f"/books/{created['id']}", json={"book_metadata": {"series": "Dune Chronicles"}}
    )
    assert response.json()["book_metadata"] == {"series": "Dune Chronicles"}


def test_patch_cannot_move_the_file(admin_client: TestClient) -> None:
    """file_path is storage-owned, so a supplied value is ignored, not applied."""
    created = admin_client.post("/books", json=BOOK_PAYLOAD).json()

    response = admin_client.patch(f"/books/{created['id']}", json={"file_path": "/etc/passwd"})
    assert response.status_code == 200
    assert response.json()["file_path"] == "dune.epub"


def test_patch_fixes_a_bad_parse_after_upload(admin_client: TestClient, tmp_path: Path) -> None:
    """The end-to-end reason PATCH exists: correcting what the parser guessed."""
    content = epub_bytes(tmp_path, name="mystery.epub", titles=[], creators=[])
    created = admin_client.post(
        "/books/upload",
        files={"file": ("mystery.epub", content, "application/epub+zip")},
    ).json()
    assert created["author"] == "Unknown"

    fixed = admin_client.patch(
        f"/books/{created['id']}",
        json={"title": "The Real Title", "author": "The Real Author"},
    ).json()

    assert fixed["title"] == "The Real Title"
    assert fixed["author"] == "The Real Author"
    assert fixed["file_path"] == created["file_path"]


def test_patch_missing_book_returns_404(admin_client: TestClient) -> None:
    assert admin_client.patch("/books/999", json={"title": "Nope"}).status_code == 404


def test_patch_answers_with_the_callers_own_state(admin_client: TestClient) -> None:
    """The response is a `BookRead`, so it has to carry the reader's state.

    It used to return the table row and let `response_model` fill in the rest
    from the defaults, so a book the caller had rated and half read came back
    unrated and unstarted. Nothing in-process noticed: the response was
    well-formed, only untrue. The client in #65 is what found it.
    """
    created = admin_client.post("/books", json=BOOK_PAYLOAD).json()
    admin_client.put(f"/books/{created['id']}/state", json={"rating": 5, "progress": 0.5})

    body = admin_client.patch(f"/books/{created['id']}", json={"title": "Dune (1965)"}).json()

    assert body["title"] == "Dune (1965)"
    assert body["rating"] == 5
    assert body["progress"] == 0.5
