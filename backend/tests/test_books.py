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
    client.post("/books", json=BOOK_PAYLOAD)
    response = client.get("/books")
    assert response.status_code == 200
    books = response.json()
    assert len(books) == 1
    assert books[0]["title"] == "Dune"


def test_get_book(client: TestClient) -> None:
    created = client.post("/books", json=BOOK_PAYLOAD).json()
    response = client.get(f"/books/{created['id']}")
    assert response.status_code == 200
    assert response.json()["author"] == "Frank Herbert"


def test_get_book_not_found(client: TestClient) -> None:
    response = client.get("/books/999")
    assert response.status_code == 404


def test_delete_book(client: TestClient) -> None:
    created = client.post("/books", json=BOOK_PAYLOAD).json()
    response = client.delete(f"/books/{created['id']}")
    assert response.status_code == 204
    assert client.get(f"/books/{created['id']}").status_code == 404
