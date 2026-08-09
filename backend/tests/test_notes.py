"""Notes and highlights.

Two things carry the weight here. The first is privacy: the catalog is shared
but marginalia is not, so most of these tests exist to prove one reader cannot
see or touch another's — the same missing `WHERE user_id = ?` that haunts
reading state.

The second is the omitted-versus-null distinction on `page`. Clearing a page
number and leaving it alone are different requests that look identical unless
`exclude_unset` is threaded all the way down, and nothing else in the API
would notice if it broke.
"""

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.models import Note, User

BOOK_PAYLOAD = {
    "title": "Dune",
    "author": "Frank Herbert",
    "format": "epub",
    "file_path": "dune.epub",
    "book_metadata": {},
}


def _make_book(client: TestClient, title: str = "Dune") -> int:
    return client.post("/books", json={**BOOK_PAYLOAD, "title": title}).json()["id"]


def test_creating_a_note_reads_it_back(client: TestClient) -> None:
    book_id = _make_book(client)

    response = client.post(
        f"/books/{book_id}/notes", json={"text": "The spice must flow.", "page": 42}
    )

    assert response.status_code == 201
    body = response.json()
    assert body["text"] == "The spice must flow."
    assert body["page"] == 42
    assert body["book_id"] == book_id
    assert body["created_at"] is not None


def test_a_note_need_not_carry_a_page(client: TestClient) -> None:
    """Highlights from an EPUB have no page number to give — reflowable text
    has no pages — so the field has to be genuinely optional."""
    book_id = _make_book(client)

    body = client.post(f"/books/{book_id}/notes", json={"text": "A thought."}).json()

    assert body["page"] is None


def test_notes_come_back_newest_first(client: TestClient) -> None:
    book_id = _make_book(client)
    for text in ("first", "second", "third"):
        client.post(f"/books/{book_id}/notes", json={"text": text})

    body = client.get(f"/books/{book_id}/notes").json()

    assert [note["text"] for note in body] == ["third", "second", "first"]


def test_a_book_with_no_notes_returns_an_empty_list(client: TestClient) -> None:
    book_id = _make_book(client)

    response = client.get(f"/books/{book_id}/notes")

    assert response.status_code == 200
    assert response.json() == []


def test_listing_notes_on_a_missing_book_is_404(client: TestClient) -> None:
    """Distinct from the empty list above, which is the whole reason
    `list_notes` raises instead of returning nothing: a typo in a book id must
    not read as 'no notes yet'."""
    assert client.get("/books/9999/notes").status_code == 404


def test_creating_a_note_on_a_missing_book_is_404(client: TestClient) -> None:
    assert client.post("/books/9999/notes", json={"text": "Hello"}).status_code == 404


def test_notes_are_private_to_their_author(client: TestClient, other_client: TestClient) -> None:
    book_id = _make_book(client)
    client.post(f"/books/{book_id}/notes", json={"text": "Mine alone."})

    # The book is shared, so the roommate can see it...
    assert other_client.get(f"/books/{book_id}").status_code == 200
    # ...but nothing written in its margins.
    assert other_client.get(f"/books/{book_id}/notes").json() == []


def test_another_reader_cannot_edit_a_note(client: TestClient, other_client: TestClient) -> None:
    book_id = _make_book(client)
    note_id = client.post(f"/books/{book_id}/notes", json={"text": "Mine."}).json()["id"]

    response = other_client.patch(f"/notes/{note_id}", json={"text": "Not yours."})

    # 404 rather than 403: saying "forbidden" would confirm the note exists.
    assert response.status_code == 404
    assert client.get(f"/books/{book_id}/notes").json()[0]["text"] == "Mine."


def test_another_reader_cannot_delete_a_note(client: TestClient, other_client: TestClient) -> None:
    book_id = _make_book(client)
    note_id = client.post(f"/books/{book_id}/notes", json={"text": "Mine."}).json()["id"]

    assert other_client.delete(f"/notes/{note_id}").status_code == 404
    assert len(client.get(f"/books/{book_id}/notes").json()) == 1


def test_an_admin_gets_no_special_access_to_notes(
    client: TestClient, admin_client: TestClient
) -> None:
    """Curating the shared vocabulary is a librarian's job; reading someone's
    private notes is not, so `is_admin` buys nothing here."""
    book_id = _make_book(client)
    note_id = client.post(f"/books/{book_id}/notes", json={"text": "Mine."}).json()["id"]

    assert admin_client.get(f"/books/{book_id}/notes").json() == []
    assert admin_client.patch(f"/notes/{note_id}", json={"text": "Seized."}).status_code == 404
    assert admin_client.delete(f"/notes/{note_id}").status_code == 404


def test_editing_the_text_leaves_the_page_alone(client: TestClient) -> None:
    book_id = _make_book(client)
    note_id = client.post(f"/books/{book_id}/notes", json={"text": "Draft", "page": 7}).json()["id"]

    body = client.patch(f"/notes/{note_id}", json={"text": "Revised"}).json()

    assert body["text"] == "Revised"
    assert body["page"] == 7


def test_an_explicit_null_page_clears_it(client: TestClient) -> None:
    """The other half of the previous test. Omitting `page` and sending it as
    null are different requests, and only `exclude_unset` tells them apart —
    without it one of these two tests must fail."""
    book_id = _make_book(client)
    note_id = client.post(f"/books/{book_id}/notes", json={"text": "Draft", "page": 7}).json()["id"]

    body = client.patch(f"/notes/{note_id}", json={"page": None}).json()

    assert body["page"] is None
    assert body["text"] == "Draft"


def test_an_empty_patch_is_rejected(client: TestClient) -> None:
    book_id = _make_book(client)
    note_id = client.post(f"/books/{book_id}/notes", json={"text": "Draft"}).json()["id"]

    assert client.patch(f"/notes/{note_id}", json={}).status_code == 422


def test_empty_text_is_rejected(client: TestClient) -> None:
    book_id = _make_book(client)

    assert client.post(f"/books/{book_id}/notes", json={"text": "   "}).status_code == 422

    note_id = client.post(f"/books/{book_id}/notes", json={"text": "Real"}).json()["id"]
    assert client.patch(f"/notes/{note_id}", json={"text": ""}).status_code == 422


def test_a_page_below_one_is_rejected(client: TestClient) -> None:
    """Proves the bound is live. `Field(ge=1)` is silently inert on
    `table=True` classes, so this only passes because it sits on `NoteCreate`
    rather than on `Note` — move it and this test goes green for the wrong
    reason."""
    book_id = _make_book(client)

    assert client.post(f"/books/{book_id}/notes", json={"text": "x", "page": 0}).status_code == 422
    assert client.post(f"/books/{book_id}/notes", json={"text": "x", "page": -3}).status_code == 422


def test_note_text_is_stored_unmangled(client: TestClient, session: Session) -> None:
    """Phase 2 ingests these rows into the vector store, so internal
    formatting has to survive the round trip. Only surrounding whitespace is
    stripped."""
    book_id = _make_book(client)
    passage = "  A beginning is the time\n\nfor taking care.  "

    note_id = client.post(f"/books/{book_id}/notes", json={"text": passage}).json()["id"]

    assert session.get(Note, note_id).text == "A beginning is the time\n\nfor taking care."


def test_deleting_a_note_removes_it(client: TestClient) -> None:
    book_id = _make_book(client)
    note_id = client.post(f"/books/{book_id}/notes", json={"text": "Ephemeral"}).json()["id"]

    assert client.delete(f"/notes/{note_id}").status_code == 204
    assert client.get(f"/books/{book_id}/notes").json() == []
    assert client.delete(f"/notes/{note_id}").status_code == 404


def test_notes_are_scoped_to_their_book(client: TestClient) -> None:
    """A reader's notes are per-book, not a single pile filtered by user."""
    dune = _make_book(client, "Dune")
    emma = _make_book(client, "Emma")
    client.post(f"/books/{dune}/notes", json={"text": "On Arrakis"})

    assert len(client.get(f"/books/{dune}/notes").json()) == 1
    assert client.get(f"/books/{emma}/notes").json() == []


def test_two_readers_annotate_the_same_book_independently(
    client: TestClient, other_client: TestClient, user: User, other_user: User
) -> None:
    book_id = _make_book(client)

    client.post(f"/books/{book_id}/notes", json={"text": "Hers"})
    other_client.post(f"/books/{book_id}/notes", json={"text": "Theirs"})

    assert [n["text"] for n in client.get(f"/books/{book_id}/notes").json()] == ["Hers"]
    assert [n["text"] for n in other_client.get(f"/books/{book_id}/notes").json()] == ["Theirs"]
