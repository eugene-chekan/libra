"""Per-user reading state: writing it, reading it back, and keeping it private.

The centre of gravity here is isolation. The defining bug of multi-user work
is a missing `WHERE user_id = ?`, and it is silent — everything still works,
it just works for the wrong person.
"""

from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlmodel import Session

from app.models import Book, User, UserBookState

BOOK_PAYLOAD = {
    "title": "Dune",
    "author": "Frank Herbert",
    "format": "epub",
    "file_path": "dune.epub",
    "book_metadata": {},
}


def _make_book(client: TestClient, title: str = "Dune") -> int:
    return client.post("/books", json={**BOOK_PAYLOAD, "title": title}).json()["id"]


def test_a_new_book_reads_back_with_default_state(client: TestClient) -> None:
    """Rows are created lazily, so 'never touched' is the common case and has
    to be the defaults rather than a null or a missing key."""
    book_id = _make_book(client)

    body = client.get(f"/books/{book_id}").json()

    assert body["rating"] == 0
    assert body["progress"] == 0.0
    assert body["position"] is None
    assert body["started_at"] is None
    assert body["finished_at"] is None


def test_setting_state_reads_back(client: TestClient) -> None:
    book_id = _make_book(client)

    response = client.put(f"/books/{book_id}/state", json={"rating": 4, "progress": 0.5})

    assert response.status_code == 200
    assert response.json()["rating"] == 4
    assert response.json()["progress"] == 0.5
    assert client.get(f"/books/{book_id}").json()["rating"] == 4


def test_position_is_stored_and_read_back(client: TestClient) -> None:
    """Where the reader stopped, in the reading client's own terms. A
    percentage cannot be turned back into a place, so the place is kept too."""
    book_id = _make_book(client)
    mark = "epubcfi(/6/4!/4/2/330/3:0)"

    response = client.put(f"/books/{book_id}/state", json={"progress": 0.08, "position": mark})

    assert response.status_code == 200
    assert response.json()["position"] == mark
    assert client.get(f"/books/{book_id}").json()["position"] == mark


def test_rating_alone_leaves_the_position(client: TestClient) -> None:
    """Rating a book must not lose the reader's place, the same way it must
    not lose their progress."""
    book_id = _make_book(client)
    mark = "epubcfi(/6/4!/4/2/330/3:0)"
    client.put(f"/books/{book_id}/state", json={"progress": 0.08, "position": mark})

    response = client.put(f"/books/{book_id}/state", json={"rating": 5})

    assert response.status_code == 200
    assert response.json()["position"] == mark


def test_progress_alone_leaves_the_rating(client: TestClient) -> None:
    """The reader writes progress on every pause in scrolling. If that reset
    the rating, the first scroll would wipe the reader's stars."""
    book_id = _make_book(client)
    client.put(f"/books/{book_id}/state", json={"rating": 4, "progress": 0.5})

    response = client.put(f"/books/{book_id}/state", json={"progress": 0.7})

    assert response.status_code == 200
    assert response.json()["rating"] == 4
    assert response.json()["progress"] == 0.7


def test_rating_alone_leaves_the_progress_and_the_finished_date(client: TestClient) -> None:
    """The mirror image: rating a book you have read must not un-read it."""
    book_id = _make_book(client)
    client.put(f"/books/{book_id}/state", json={"rating": 0, "progress": 1.0})
    finished_at = client.get(f"/books/{book_id}").json()["finished_at"]
    assert finished_at is not None

    response = client.put(f"/books/{book_id}/state", json={"rating": 5})

    assert response.status_code == 200
    assert response.json()["progress"] == 1.0
    assert response.json()["finished_at"] == finished_at
    assert response.json()["rating"] == 5


def test_an_explicit_zero_rating_still_clears_it(client: TestClient) -> None:
    """Saying nothing means leave it alone; saying zero means unrate it."""
    book_id = _make_book(client)
    client.put(f"/books/{book_id}/state", json={"rating": 4, "progress": 0.5})

    response = client.put(f"/books/{book_id}/state", json={"rating": 0})

    assert response.json()["rating"] == 0
    assert response.json()["progress"] == 0.5


def test_an_explicit_zero_progress_still_rewinds_the_book(client: TestClient) -> None:
    book_id = _make_book(client)
    client.put(f"/books/{book_id}/state", json={"rating": 3, "progress": 1.0})

    response = client.put(f"/books/{book_id}/state", json={"progress": 0.0})

    assert response.json()["progress"] == 0.0
    assert response.json()["finished_at"] is None
    assert response.json()["rating"] == 3


def test_state_is_created_lazily(client: TestClient, session: Session) -> None:
    """Reading a book must not write a row; otherwise listing the library
    writes one row per book per user."""
    book_id = _make_book(client)
    client.get(f"/books/{book_id}")
    client.get("/books")

    assert session.get(UserBookState, (1, book_id)) is None


def test_state_for_a_missing_book_is_404(client: TestClient) -> None:
    assert client.put("/books/999/state", json={"rating": 1, "progress": 0}).status_code == 404


def test_rating_out_of_range_is_rejected(client: TestClient) -> None:
    """The bounds live on the write model, because SQLModel silently skips
    validation on table classes — `UserBookState(rating=99)` is accepted."""
    book_id = _make_book(client)

    assert (
        client.put(f"/books/{book_id}/state", json={"rating": 99, "progress": 0}).status_code == 422
    )
    assert (
        client.put(f"/books/{book_id}/state", json={"rating": -1, "progress": 0}).status_code == 422
    )
    assert (
        client.put(f"/books/{book_id}/state", json={"rating": 0, "progress": 1.5}).status_code
        == 422
    )
    assert (
        client.put(f"/books/{book_id}/state", json={"rating": 0, "progress": -0.1}).status_code
        == 422
    )


def test_out_of_range_state_is_not_persisted(client: TestClient, session: Session) -> None:
    """A 422 that still wrote the row would be worse than no validation."""
    book_id = _make_book(client)
    client.put(f"/books/{book_id}/state", json={"rating": 99, "progress": 0})

    assert session.get(UserBookState, (1, book_id)) is None


# --- timestamps ----------------------------------------------------------


def test_started_at_is_stamped_on_first_progress(client: TestClient) -> None:
    book_id = _make_book(client)

    unread = client.put(f"/books/{book_id}/state", json={"rating": 0, "progress": 0}).json()
    assert unread["started_at"] is None

    started = client.put(f"/books/{book_id}/state", json={"rating": 0, "progress": 0.1}).json()
    assert started["started_at"] is not None


def test_started_at_is_not_moved_by_later_progress(client: TestClient) -> None:
    """A re-read does not change when this reader first opened the book."""
    book_id = _make_book(client)
    first = client.put(f"/books/{book_id}/state", json={"rating": 0, "progress": 0.1}).json()

    later = client.put(f"/books/{book_id}/state", json={"rating": 0, "progress": 0.9}).json()

    assert later["started_at"] == first["started_at"]


def test_finished_at_is_stamped_at_full_progress(client: TestClient) -> None:
    book_id = _make_book(client)

    body = client.put(f"/books/{book_id}/state", json={"rating": 5, "progress": 1.0}).json()

    assert body["finished_at"] is not None
    # Finishing in one go still counts as having started.
    assert body["started_at"] is not None


def test_finishing_twice_keeps_the_first_date(client: TestClient) -> None:
    book_id = _make_book(client)
    first = client.put(f"/books/{book_id}/state", json={"rating": 5, "progress": 1.0}).json()

    again = client.put(f"/books/{book_id}/state", json={"rating": 5, "progress": 1.0}).json()

    assert again["finished_at"] == first["finished_at"]


def test_reopening_a_finished_book_clears_finished_at(client: TestClient) -> None:
    """Otherwise 'finished' would mean 'finished at some point', which no view
    wants — a book being re-read is not a finished book."""
    book_id = _make_book(client)
    client.put(f"/books/{book_id}/state", json={"rating": 5, "progress": 1.0})

    reopened = client.put(f"/books/{book_id}/state", json={"rating": 5, "progress": 0.3}).json()

    assert reopened["finished_at"] is None
    assert reopened["started_at"] is not None


# --- isolation -----------------------------------------------------------


def test_one_readers_state_is_invisible_to_another(
    client: TestClient, other_client: TestClient
) -> None:
    book_id = _make_book(client)
    client.put(f"/books/{book_id}/state", json={"rating": 5, "progress": 0.8})

    theirs = other_client.get(f"/books/{book_id}").json()

    assert theirs["rating"] == 0
    assert theirs["progress"] == 0.0


def test_two_readers_hold_independent_state(client: TestClient, other_client: TestClient) -> None:
    book_id = _make_book(client)

    client.put(f"/books/{book_id}/state", json={"rating": 5, "progress": 1.0})
    other_client.put(f"/books/{book_id}/state", json={"rating": 1, "progress": 0.2})

    assert client.get(f"/books/{book_id}").json()["rating"] == 5
    assert other_client.get(f"/books/{book_id}").json()["rating"] == 1


def test_the_shared_catalog_is_still_shared(client: TestClient, other_client: TestClient) -> None:
    """Only reading state is private. Both readers see the same book."""
    book_id = _make_book(client)

    assert other_client.get(f"/books/{book_id}").json()["title"] == "Dune"
    assert other_client.get("/books").json()["total"] == 1


def test_listing_carries_each_callers_own_state(
    client: TestClient, other_client: TestClient
) -> None:
    """The list endpoint is a separate code path from the detail endpoint, so
    a scoping bug can live in one and not the other."""
    book_id = _make_book(client)
    client.put(f"/books/{book_id}/state", json={"rating": 3, "progress": 0.4})

    assert client.get("/books").json()["items"][0]["rating"] == 3
    assert other_client.get("/books").json()["items"][0]["rating"] == 0


# --- query shape ---------------------------------------------------------


def _seed_books(session: Session, count: int, offset: int = 0) -> None:
    for index in range(offset, offset + count):
        session.add(
            Book(title=f"Book {index}", author="A", format="epub", file_path=f"{index}.epub")
        )
    session.commit()


def _count_queries_touching_books(session: Session, client: TestClient) -> int:
    """SELECTs against `book` issued while listing the library.

    Filtered to `book` deliberately: authenticating the request also reloads
    the `user` row, which is fixed overhead and would otherwise be counted as
    if it were part of the listing.
    """
    seen: list[str] = []
    bind = session.get_bind()

    @event.listens_for(bind, "before_cursor_execute")
    def record(conn, cursor, statement, parameters, context, executemany):  # noqa: ANN001
        normalised = statement.lstrip().upper()
        if normalised.startswith("SELECT") and "BOOK" in normalised:
            seen.append(statement)

    try:
        client.get("/books")
    finally:
        event.remove(bind, "before_cursor_execute", record)
    return len(seen)


def test_listing_books_is_not_n_plus_one(client: TestClient, session: Session, user: User) -> None:
    """Merging per-user state must cost the same whether the library holds one
    book or a hundred.

    The naive implementation — fetch the books, then look up each reader's
    state row one at a time — is invisible until someone owns a few hundred
    books, at which point every listing issues hundreds of queries.

    Comparing two library sizes rather than asserting a magic number: this
    tests the actual property, and cannot be satisfied by a constant that
    happens to be small.
    """
    _seed_books(session, 1)
    with_one = _count_queries_touching_books(session, client)

    _seed_books(session, 20, offset=1)
    with_twenty = _count_queries_touching_books(session, client)

    assert client.get("/books").json()["total"] == 21
    assert with_twenty == with_one, (
        f"query count grew with library size ({with_one} -> {with_twenty}): "
        "the per-user state merge is an N+1"
    )
    # Two, and pinned: the outer join that merges reading state, plus one
    # grouped fetch of every visible tag assignment. Not "at most a few" — an
    # exact bound, so that adding a third query is a decision someone makes on
    # purpose rather than something that drifts in a milestone at a time.
    assert with_one == 2
