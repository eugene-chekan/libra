from fastapi.testclient import TestClient

BOOK_PAYLOAD = {
    "title": "Dune",
    "author": "Frank Herbert",
    "format": "epub",
    "file_path": "/library/dune.epub",
    "book_metadata": {"series": "Dune Chronicles", "book_number": 1},
}


def test_create_book(client: TestClient) -> None:
    response = client.post("/books", json=BOOK_PAYLOAD)
    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "Dune"
    assert body["id"] is not None


def test_list_books(client: TestClient) -> None:
    """The response is an envelope, not a bare list — decided before
    pagination exists, so the shape never has to change under a client."""
    client.post("/books", json=BOOK_PAYLOAD)
    response = client.get("/books")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["title"] == "Dune"


def test_get_book(client: TestClient) -> None:
    created = client.post("/books", json=BOOK_PAYLOAD).json()
    response = client.get(f"/books/{created['id']}")
    assert response.status_code == 200
    assert response.json()["author"] == "Frank Herbert"


def test_get_book_not_found(client: TestClient) -> None:
    response = client.get("/books/999")
    assert response.status_code == 404


def test_delete_book(admin_client: TestClient) -> None:
    """Admin client: deleting removes a file the whole household shares."""
    created = admin_client.post("/books", json=BOOK_PAYLOAD).json()
    response = admin_client.delete(f"/books/{created['id']}")
    assert response.status_code == 204
    assert admin_client.get(f"/books/{created['id']}").status_code == 404


def test_delete_book_takes_everything_hanging_off_it(admin_client: TestClient) -> None:
    """A book's rating, progress, tags and notes go with it.

    SQLite hands out the same id again once a row is gone, and nothing here
    enforces the foreign keys, so anything left behind is inherited by the
    next book uploaded. Whether the id is reused is SQLite's business; that it
    carries nothing over is ours.
    """
    book = admin_client.post("/books", json=BOOK_PAYLOAD).json()
    tag = admin_client.post("/tags", json={"name": "keeper"}).json()
    admin_client.put(
        f"/books/{book['id']}/state",
        json={"rating": 5, "progress": 0.5, "tag_ids": [tag["id"]]},
    )
    admin_client.post(f"/books/{book['id']}/notes", json={"text": "worth remembering"})

    assert admin_client.delete(f"/books/{book['id']}").status_code == 204

    successor = admin_client.post("/books", json={**BOOK_PAYLOAD, "title": "Someone Else"}).json()
    fresh = admin_client.get(f"/books/{successor['id']}").json()
    assert fresh["rating"] == 0
    assert fresh["progress"] == 0
    assert fresh["tag_ids"] == []
    assert admin_client.get(f"/books/{successor['id']}/notes").json() == []
