"""Shelves: owned, ordered, private by default.

The rules worth breaking things over are here: a rename must not orphan its
books (the bug stable ids exist to prevent), a private shelf must be
indistinguishable from a missing one, and a public shelf must be readable by
everyone and writable by nobody but its owner.
"""

from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlmodel import Session, select

from app.models import Shelf, User, UserBookState

BOOK_PAYLOAD = {
    "title": "Dune",
    "author": "Frank Herbert",
    "format": "epub",
    "file_path": "dune.epub",
    "book_metadata": {},
}


def _shelf(client: TestClient, name: str = "To Read", visibility: str = "private") -> dict:
    return client.post("/shelves", json={"name": name, "visibility": visibility}).json()


def _book(client: TestClient, title: str = "Dune") -> int:
    return client.post("/books", json={**BOOK_PAYLOAD, "title": title}).json()["id"]


def _place(client: TestClient, book_id: int, shelf_id: int | None):
    return client.put(
        f"/books/{book_id}/state", json={"rating": 0, "progress": 0, "shelf_id": shelf_id}
    )


# --- basics ---------------------------------------------------------------


def test_creating_a_shelf_appends_it_to_your_order(client: TestClient) -> None:
    first = _shelf(client, "To Read")
    second = _shelf(client, "Completed")

    assert first["position"] == 0
    assert second["position"] == 1
    assert first["visibility"] == "private"


def test_display_casing_is_preserved(client: TestClient) -> None:
    """Shelf names are display text, unlike usernames, so they keep their case."""
    assert _shelf(client, "Currently Reading")["name"] == "Currently Reading"


def test_duplicate_names_are_rejected_case_insensitively(client: TestClient) -> None:
    _shelf(client, "To Read")

    response = client.post("/shelves", json={"name": "TO READ", "visibility": "private"})

    assert response.status_code == 409


def test_the_same_name_is_free_for_a_different_reader(
    client: TestClient, other_client: TestClient
) -> None:
    """Uniqueness is per owner: two people may each have a "To Read"."""
    _shelf(client, "To Read")

    assert other_client.post("/shelves", json={"name": "To Read"}).status_code == 201


def test_an_empty_name_is_rejected(client: TestClient) -> None:
    assert client.post("/shelves", json={"name": "   "}).status_code == 422


def test_an_unknown_visibility_is_rejected(client: TestClient) -> None:
    """A Literal on the write model, since enums do not bite on table models."""
    assert client.post("/shelves", json={"name": "X", "visibility": "sort-of"}).status_code == 422


# --- the bug stable ids exist to prevent ----------------------------------


def test_renaming_a_shelf_does_not_orphan_its_books(client: TestClient) -> None:
    """The regression test for the prototype's name-matched shelves: renaming
    one left its books pointing at a name that no longer existed, and they
    silently vanished from the shelves view."""
    shelf = _shelf(client, "To Read")
    book_id = _book(client)
    _place(client, book_id, shelf["id"])

    renamed = client.patch(f"/shelves/{shelf['id']}", json={"name": "Someday"})

    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Someday"
    # Same shelf, same books.
    assert client.get(f"/books/{book_id}").json()["shelf_id"] == shelf["id"]
    assert client.get(f"/shelves/{shelf['id']}").json()["book_count"] == 1


# --- visibility -----------------------------------------------------------


def test_a_private_shelf_is_invisible_to_others(
    client: TestClient, other_client: TestClient
) -> None:
    shelf = _shelf(client, "Secret")

    # 404, not 403: a 403 would confirm it exists.
    assert other_client.get(f"/shelves/{shelf['id']}").status_code == 404
    assert other_client.get("/shelves").json() == []


def test_an_admin_cannot_read_a_private_shelf(client: TestClient, admin_client: TestClient) -> None:
    """Admin curates shared things — the catalog, the global vocabulary — and
    is not a way to read what a household member marked private. This is the
    rule somebody will later "fix" by accident."""
    shelf = _shelf(client, "Secret")

    assert admin_client.get(f"/shelves/{shelf['id']}").status_code == 404


def test_a_public_shelf_is_readable_by_others(client: TestClient, other_client: TestClient) -> None:
    shelf = _shelf(client, "Recommended", visibility="public")

    assert other_client.get(f"/shelves/{shelf['id']}").status_code == 200
    assert [s["id"] for s in other_client.get("/shelves").json()] == [shelf["id"]]


def test_a_public_shelf_is_not_writable_by_others(
    client: TestClient, other_client: TestClient
) -> None:
    shelf = _shelf(client, "Recommended", visibility="public")

    assert other_client.patch(f"/shelves/{shelf['id']}", json={"name": "Mine"}).status_code == 403
    assert other_client.delete(f"/shelves/{shelf['id']}").status_code == 403
    # And it really is unchanged.
    assert client.get(f"/shelves/{shelf['id']}").json()["name"] == "Recommended"


def test_listing_marks_which_shelves_you_may_edit(
    client: TestClient, other_client: TestClient
) -> None:
    _shelf(client, "Recommended", visibility="public")
    other_client.post("/shelves", json={"name": "Mine"})

    listed = other_client.get("/shelves").json()
    by_name = {shelf["name"]: shelf for shelf in listed}

    assert by_name["Mine"]["editable"] is True
    assert by_name["Recommended"]["editable"] is False


def test_your_own_shelves_come_before_other_peoples(
    client: TestClient, other_client: TestClient
) -> None:
    client.post("/shelves", json={"name": "Theirs", "visibility": "public"})
    other_client.post("/shelves", json={"name": "Mine"})

    listed = other_client.get("/shelves").json()

    assert [shelf["name"] for shelf in listed] == ["Mine", "Theirs"]


# --- placement ------------------------------------------------------------


def test_a_book_can_be_placed_and_removed(client: TestClient) -> None:
    shelf = _shelf(client)
    book_id = _book(client)

    assert _place(client, book_id, shelf["id"]).json()["shelf_id"] == shelf["id"]
    assert _place(client, book_id, None).json()["shelf_id"] is None


def test_omitting_shelf_id_leaves_the_placement_alone(client: TestClient) -> None:
    """Otherwise every rating change would silently unshelve the book."""
    shelf = _shelf(client)
    book_id = _book(client)
    _place(client, book_id, shelf["id"])

    updated = client.put(f"/books/{book_id}/state", json={"rating": 5, "progress": 0.5}).json()

    assert updated["shelf_id"] == shelf["id"]


def test_you_cannot_place_a_book_on_someone_elses_shelf(
    client: TestClient, other_client: TestClient
) -> None:
    """The rule no foreign key expresses. The column would accept the id
    happily — and with SQLite's foreign keys off, a nonexistent one too."""
    theirs = _shelf(client, "Recommended", visibility="public")
    book_id = _book(other_client, "Their Book")

    assert _place(other_client, book_id, theirs["id"]).status_code == 403


def test_placing_on_an_invisible_shelf_is_404(client: TestClient, other_client: TestClient) -> None:
    private = _shelf(client, "Secret")
    book_id = _book(other_client, "Their Book")

    assert _place(other_client, book_id, private["id"]).status_code == 404


def test_placing_on_a_nonexistent_shelf_is_404(client: TestClient) -> None:
    book_id = _book(client)

    assert _place(client, book_id, 999).status_code == 404


# --- deletion -------------------------------------------------------------


def test_deleting_a_shelf_unshelves_its_books_by_default(
    client: TestClient, session: Session
) -> None:
    """Not moved somewhere the reader did not choose — the prototype's
    fallback of reassigning to the first remaining shelf is deliberately not
    reproduced."""
    shelf = _shelf(client)
    book_id = _book(client)
    _place(client, book_id, shelf["id"])

    assert client.delete(f"/shelves/{shelf['id']}").status_code == 204

    assert client.get(f"/books/{book_id}").json()["shelf_id"] is None
    assert session.exec(select(Shelf)).all() == []


def test_deleting_with_reassignment_moves_the_books(client: TestClient) -> None:
    source = _shelf(client, "To Read")
    destination = _shelf(client, "Someday")
    book_id = _book(client)
    _place(client, book_id, source["id"])

    response = client.delete(f"/shelves/{source['id']}?reassign_to={destination['id']}")

    assert response.status_code == 204
    assert client.get(f"/books/{book_id}").json()["shelf_id"] == destination["id"]


def test_reassigning_to_the_shelf_being_deleted_is_rejected(client: TestClient) -> None:
    shelf = _shelf(client)

    assert client.delete(f"/shelves/{shelf['id']}?reassign_to={shelf['id']}").status_code == 422


def test_reassigning_to_someone_elses_shelf_is_rejected(
    client: TestClient, other_client: TestClient
) -> None:
    theirs = _shelf(client, "Recommended", visibility="public")
    mine = other_client.post("/shelves", json={"name": "Mine"}).json()

    response = other_client.delete(f"/shelves/{mine['id']}?reassign_to={theirs['id']}")

    assert response.status_code == 403
    # And nothing was deleted on the way to refusing.
    assert other_client.get(f"/shelves/{mine['id']}").status_code == 200


# --- ordering -------------------------------------------------------------


def test_reordering_rewrites_every_position(client: TestClient) -> None:
    first = _shelf(client, "A")
    second = _shelf(client, "B")
    third = _shelf(client, "C")

    reordered = client.put(
        "/shelves/order", json={"shelf_ids": [third["id"], first["id"], second["id"]]}
    )

    assert reordered.status_code == 200
    assert [shelf["name"] for shelf in reordered.json()] == ["C", "A", "B"]
    assert [shelf["position"] for shelf in reordered.json()] == [0, 1, 2]


def test_a_partial_order_is_rejected(client: TestClient) -> None:
    """A stale client that has not seen a newly created shelf would otherwise
    silently drop it out of the ordering."""
    first = _shelf(client, "A")
    _shelf(client, "B")

    assert client.put("/shelves/order", json={"shelf_ids": [first["id"]]}).status_code == 422


def test_an_order_containing_someone_elses_shelf_is_rejected(
    client: TestClient, other_client: TestClient
) -> None:
    theirs = _shelf(client, "Recommended", visibility="public")
    mine = other_client.post("/shelves", json={"name": "Mine"}).json()

    response = other_client.put("/shelves/order", json={"shelf_ids": [mine["id"], theirs["id"]]})

    assert response.status_code == 422


def test_a_duplicated_id_in_the_order_is_rejected(client: TestClient) -> None:
    shelf = _shelf(client, "A")
    _shelf(client, "B")

    response = client.put("/shelves/order", json={"shelf_ids": [shelf["id"], shelf["id"]]})

    assert response.status_code == 422


# --- query shape ----------------------------------------------------------


def test_listing_shelves_does_not_count_books_one_shelf_at_a_time(
    client: TestClient, session: Session, user: User
) -> None:
    """The Shelves page shows a count against every shelf, so counting them in
    a loop is the same N+1 the book listing avoids."""

    def count_queries(expected_shelves: int) -> int:
        seen: list[str] = []
        bind = session.get_bind()

        @event.listens_for(bind, "before_cursor_execute")
        def record(conn, cursor, statement, parameters, context, executemany):  # noqa: ANN001
            upper = statement.lstrip().upper()
            if upper.startswith("SELECT") and ("SHELF" in upper or "USER_BOOK_STATE" in upper):
                seen.append(statement)

        try:
            assert len(client.get("/shelves").json()) == expected_shelves
        finally:
            event.remove(bind, "before_cursor_execute", record)
        return len(seen)

    _shelf(client, "A")
    with_one = count_queries(1)

    for name in "BCDEFGHIJ":
        _shelf(client, name)
    with_ten = count_queries(10)

    assert with_ten == with_one, (
        f"query count grew with shelf count ({with_one} -> {with_ten}): "
        "book counts are being fetched per shelf"
    )


def test_book_counts_are_per_shelf(client: TestClient) -> None:
    busy = _shelf(client, "Busy")
    _shelf(client, "Empty")
    for title in ("One", "Two"):
        _place(client, _book(client, title), busy["id"])

    counts = {shelf["name"]: shelf["book_count"] for shelf in client.get("/shelves").json()}

    assert counts == {"Busy": 2, "Empty": 0}


def test_book_counts_do_not_leak_other_readers_placements(
    client: TestClient, other_client: TestClient, session: Session, other_user: User
) -> None:
    """A public shelf shows its owner's books, not the viewer's."""
    shelf = _shelf(client, "Recommended", visibility="public")
    book_id = _book(client)
    _place(client, book_id, shelf["id"])

    # The other reader has this book on no shelf of their own.
    assert session.get(UserBookState, (other_user.id, book_id)) is None

    listed = other_client.get("/shelves").json()
    assert listed[0]["book_count"] == 1


def test_shelves_name_their_owner(client: TestClient, other_client: TestClient) -> None:
    """The client labels somebody else's public shelf "by {username}", and
    listing users is admin-only — so the name has to travel with the shelf or a
    reader cannot tell two shared shelves apart."""
    other_client.post("/shelves", json={"name": "Borrowed", "visibility": "public"})

    shelves = client.get("/shelves").json()

    shared = next(s for s in shelves if not s["editable"])
    assert shared["owner_username"] == "roommate"


def test_your_own_shelves_name_you_too(client: TestClient) -> None:
    client.post("/shelves", json={"name": "Mine"})

    mine = client.get("/shelves").json()[0]

    assert mine["owner_username"] == "reader"
