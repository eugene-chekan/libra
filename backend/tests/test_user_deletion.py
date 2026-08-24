"""Removing an account, and what survives it.

The rule the whole cascade serves: a shared catalog should not lose books
because a household member left. Everything private to the reader goes;
the books they happened to upload stay, with `uploaded_by` nulled.

SQLite has foreign-key enforcement off by default, so nothing here is done
for us — every dependent row is deleted by hand, and every one of those hand
deletions needs a test that would notice it being dropped.
"""

from pathlib import Path

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models import (
    Book,
    BookTag,
    Note,
    Shelf,
    Tag,
    User,
    UserBookState,
    UserSession,
)
from tests.conftest import USER_PASSWORD
from tests.epub_factory import epub_bytes

BOOK_PAYLOAD = {
    "title": "Dune",
    "author": "Frank Herbert",
    "format": "epub",
    "file_path": "dune.epub",
    "book_metadata": {},
}


def test_an_admin_can_delete_a_user(admin_client: TestClient, session: Session, user: User) -> None:
    user_id = user.id

    assert admin_client.delete(f"/users/{user_id}").status_code == 204
    assert session.get(User, user_id) is None


def test_an_ordinary_user_cannot_delete_anyone(client: TestClient, other_user: User) -> None:
    assert client.delete(f"/users/{other_user.id}").status_code == 403


def test_deleting_an_unknown_user_is_404(admin_client: TestClient) -> None:
    assert admin_client.delete("/users/9999").status_code == 404


def test_an_admin_cannot_delete_themselves(
    admin_client: TestClient, session: Session, admin_user: User
) -> None:
    """Hiding the control on your own row is a courtesy; this is the guard.

    It is also what makes a last-admin check unnecessary: the endpoint is
    admin-only, so a caller who cannot delete themselves always survives their
    own request, and an instance can never end up with no administrator.
    """
    response = admin_client.delete(f"/users/{admin_user.id}")

    assert response.status_code == 409
    assert session.get(User, admin_user.id) is not None


def test_their_books_survive_with_the_uploader_nulled(
    client: TestClient,
    admin_client: TestClient,
    session: Session,
    user: User,
    tmp_path: Path,
) -> None:
    """The point of the whole exercise.

    Goes through the upload path rather than `POST /books`, which never sets
    `uploaded_by` — so a row created that way would have nothing to null and
    the test would pass without proving anything.
    """
    book_id = client.post(
        "/books/upload",
        files={"file": ("dune.epub", epub_bytes(tmp_path), "application/epub+zip")},
    ).json()["id"]
    assert session.get(Book, book_id).uploaded_by == user.id

    admin_client.delete(f"/users/{user.id}")

    session.expire_all()
    book = session.get(Book, book_id)
    assert book is not None
    assert book.uploaded_by is None


def test_their_shelves_reading_state_and_notes_go(
    client: TestClient, admin_client: TestClient, session: Session, user: User
) -> None:
    user_id = user.id
    book_id = client.post("/books", json=BOOK_PAYLOAD).json()["id"]
    shelf_id = client.post("/shelves", json={"name": "Reading"}).json()["id"]
    client.put(f"/books/{book_id}/state", json={"rating": 4, "progress": 0.5, "shelf_id": shelf_id})
    client.post(f"/books/{book_id}/notes", json={"text": "A thought."})

    admin_client.delete(f"/users/{user_id}")

    session.expire_all()
    assert session.get(Shelf, shelf_id) is None
    assert session.get(UserBookState, (user_id, book_id)) is None
    assert session.exec(select(Note).where(Note.user_id == user_id)).all() == []


def test_their_personal_tags_and_the_links_to_them_go(
    client: TestClient, admin_client: TestClient, session: Session, user: User
) -> None:
    """The link rows matter as much as the tags. `book_tag` carries no
    `user_id`, so a row left behind would point at a tag that no longer
    exists — the same stranding `delete_tag` deletes its links to avoid."""
    user_id = user.id
    book_id = client.post("/books", json=BOOK_PAYLOAD).json()["id"]
    tag_id = client.post("/tags", json={"name": "Beach-reading"}).json()["id"]
    client.put(f"/books/{book_id}/state", json={"tag_ids": [tag_id]})
    assert session.exec(select(BookTag).where(BookTag.tag_id == tag_id)).all() != []

    admin_client.delete(f"/users/{user_id}")

    session.expire_all()
    assert session.get(Tag, tag_id) is None
    assert session.exec(select(BookTag).where(BookTag.tag_id == tag_id)).all() == []


def test_global_tags_and_their_assignments_survive(
    admin_client: TestClient, client: TestClient, session: Session, user: User
) -> None:
    """A global tag describes the book for the whole household. It has no
    owner to lose, and the assignment is nobody's personal data."""
    book_id = client.post("/books", json=BOOK_PAYLOAD).json()["id"]
    tag_id = admin_client.post("/tags?make_global=true", json={"name": "Sci-Fi"}).json()["id"]
    session.add(BookTag(book_id=book_id, tag_id=tag_id))
    session.commit()

    admin_client.delete(f"/users/{user.id}")

    session.expire_all()
    assert session.get(Tag, tag_id) is not None
    assert session.exec(select(BookTag).where(BookTag.tag_id == tag_id)).all() != []


def test_their_sessions_go(
    anon_client: TestClient, admin_client: TestClient, session: Session, user: User
) -> None:
    """A live cookie must stop working. Left behind, the row would either
    keep authenticating a deleted account or point at nothing."""
    login = anon_client.post("/auth/login", json={"username": "reader", "password": USER_PASSWORD})
    assert login.status_code == 200
    assert session.exec(select(UserSession).where(UserSession.user_id == user.id)).all() != []

    admin_client.delete(f"/users/{user.id}")

    session.expire_all()
    assert session.exec(select(UserSession).where(UserSession.user_id == user.id)).all() == []
    assert anon_client.get("/auth/me").status_code == 401


def test_another_readers_data_is_untouched(
    client: TestClient,
    other_client: TestClient,
    admin_client: TestClient,
    session: Session,
    user: User,
    other_user: User,
) -> None:
    """The cascade is a series of hand-written `WHERE user_id = ?` clauses,
    and a missing one would take the roommate's shelf with it."""
    book_id = client.post("/books", json=BOOK_PAYLOAD).json()["id"]
    kept_shelf = other_client.post("/shelves", json={"name": "Theirs"}).json()["id"]
    kept_tag = other_client.post("/tags", json={"name": "Theirs-too"}).json()["id"]
    other_client.put(f"/books/{book_id}/state", json={"rating": 5, "progress": 0.2})
    other_client.post(f"/books/{book_id}/notes", json={"text": "Kept."})

    admin_client.delete(f"/users/{user.id}")

    session.expire_all()
    assert session.get(Shelf, kept_shelf) is not None
    assert session.get(Tag, kept_tag) is not None
    assert session.get(UserBookState, (other_user.id, book_id)) is not None
    assert session.exec(select(Note).where(Note.user_id == other_user.id)).all() != []


def test_deleting_a_user_requires_a_session(anon_client: TestClient) -> None:
    assert anon_client.delete("/users/1").status_code == 401
