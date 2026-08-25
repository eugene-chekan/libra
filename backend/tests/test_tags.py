"""Tags: global ones curated by admins, personal ones private to a reader.

The two rules worth breaking things over: a personal tag is invisible to
everyone else, and only an admin touches the shared vocabulary — including
applying it to a book, since a global assignment changes what the whole
household sees.
"""

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models import BookTag, Tag

BOOK_PAYLOAD = {
    "title": "Dune",
    "author": "Frank Herbert",
    "format": "epub",
    "file_path": "dune.epub",
    "book_metadata": {},
}


def _book(client: TestClient, title: str = "Dune") -> int:
    return client.post("/books", json={**BOOK_PAYLOAD, "title": title}).json()["id"]


def _tag(client: TestClient, name: str, make_global: bool = False):
    suffix = "?make_global=true" if make_global else ""
    return client.post(f"/tags{suffix}", json={"name": name})


def _set_tags(client: TestClient, book_id: int, tag_ids: list[int]):
    return client.put(
        f"/books/{book_id}/state", json={"rating": 0, "progress": 0, "tag_ids": tag_ids}
    )


# --- vocabulary -----------------------------------------------------------


def test_a_reader_creates_personal_tags(client: TestClient) -> None:
    body = _tag(client, "Read-on-the-train").json()

    assert body["is_global"] is False
    assert body["owner_id"] is not None
    assert body["editable"] is True


def test_an_admin_creates_global_tags(admin_client: TestClient) -> None:
    body = _tag(admin_client, "Sci-Fi", make_global=True).json()

    assert body["is_global"] is True
    assert body["owner_id"] is None


def test_an_ordinary_reader_cannot_create_a_global_tag(client: TestClient) -> None:
    """Global assignment is global, so minting one changes what everyone sees."""
    assert _tag(client, "Sci-Fi", make_global=True).status_code == 403


def test_display_casing_is_preserved(client: TestClient) -> None:
    assert _tag(client, "Science-Fiction").json()["name"] == "Science-Fiction"


def test_duplicate_personal_names_are_rejected_case_insensitively(client: TestClient) -> None:
    _tag(client, "Favourites")

    assert _tag(client, "FAVOURITES").status_code == 409


def test_the_same_personal_name_is_free_for_another_reader(
    client: TestClient, other_client: TestClient
) -> None:
    _tag(client, "Favourites")

    assert _tag(other_client, "Favourites").status_code == 201


def test_a_personal_tag_may_not_shadow_a_global_one(
    admin_client: TestClient, client: TestClient
) -> None:
    """Two rows both rendering as "Sci-Fi" in one sidebar is a bug from the
    reader's side, however defensible it is in the schema."""
    _tag(admin_client, "Sci-Fi", make_global=True)

    assert _tag(client, "sci-fi").status_code == 409


def test_duplicate_global_names_are_rejected(admin_client: TestClient) -> None:
    """The partial unique index. A plain composite index over a nullable
    owner_id does not catch this — NULL never equals NULL."""
    _tag(admin_client, "Sci-Fi", make_global=True)

    assert _tag(admin_client, "SCI-FI", make_global=True).status_code == 409


def test_the_database_rejects_duplicate_globals_too(session: Session) -> None:
    """Not just the route check: the index is the actual guarantee."""
    session.add(Tag(owner_id=None, name="Sci-Fi"))
    session.commit()

    session.add(Tag(owner_id=None, name="sci-fi"))
    try:
        session.commit()
        raised = False
    except Exception:
        session.rollback()
        raised = True

    assert raised, "the partial unique index is not enforcing global tag names"


def test_an_empty_name_is_rejected(client: TestClient) -> None:
    assert _tag(client, "   ").status_code == 422


def test_a_name_with_a_space_is_rejected(client: TestClient) -> None:
    """The search box splits on whitespace, so "lent out" is a tag the reader
    could create and then never find: `#lent` matches nothing and `out` becomes
    a title search. The name has to stay one token to be reachable."""
    response = _tag(client, "lent out")

    assert response.status_code == 422
    assert "hyphen" in response.json()["detail"]


def test_a_hyphenated_name_is_accepted(client: TestClient) -> None:
    assert _tag(client, "lent-out").json()["name"] == "lent-out"


def test_a_tab_counts_as_a_space(client: TestClient) -> None:
    """`str.strip()` removes the outer whitespace, so a name is only rejected
    for what is left inside it — and a tab there splits the search box exactly
    like a space does."""
    assert _tag(client, "  lent	out  ").status_code == 422


def test_renaming_into_a_space_is_rejected(client: TestClient) -> None:
    """The rule lives in one place, so both write paths get it. Without this
    test, `PATCH` could keep its own `strip()` and let the banned name in
    through the back door."""
    tag_id = _tag(client, "lent-out").json()["id"]

    assert client.patch(f"/tags/{tag_id}", json={"name": "lent out"}).status_code == 422
    assert client.get("/tags").json()[0]["name"] == "lent-out"


# --- visibility -----------------------------------------------------------


def test_the_vocabulary_is_globals_plus_your_own(
    admin_client: TestClient, client: TestClient, other_client: TestClient
) -> None:
    _tag(admin_client, "Sci-Fi", make_global=True)
    _tag(client, "Mine")
    _tag(other_client, "Theirs")

    names = [tag["name"] for tag in client.get("/tags").json()]

    assert names == ["Sci-Fi", "Mine"]  # globals first, then own


def test_another_readers_personal_tag_is_not_found_by_id(
    client: TestClient, other_client: TestClient
) -> None:
    """404, not 403 — a 403 would confirm it exists."""
    theirs = _tag(other_client, "Theirs").json()

    assert client.patch(f"/tags/{theirs['id']}", json={"name": "Mine now"}).status_code == 404
    assert client.delete(f"/tags/{theirs['id']}").status_code == 404


def test_an_admin_cannot_read_a_personal_tag_either(
    client: TestClient, admin_client: TestClient
) -> None:
    """Admin curates the shared vocabulary, not what a reader keeps privately."""
    mine = _tag(client, "Mine").json()

    assert admin_client.patch(f"/tags/{mine['id']}", json={"name": "X"}).status_code == 404


def test_global_tags_are_not_editable_by_ordinary_readers(
    admin_client: TestClient, client: TestClient
) -> None:
    tag = _tag(admin_client, "Sci-Fi", make_global=True).json()

    assert client.patch(f"/tags/{tag['id']}", json={"name": "Renamed"}).status_code == 403
    assert client.delete(f"/tags/{tag['id']}").status_code == 403
    # The listing says so up front, so a client need not re-derive the rule.
    listed = next(t for t in client.get("/tags").json() if t["id"] == tag["id"])
    assert listed["editable"] is False


# --- renaming -------------------------------------------------------------


def test_renaming_a_tag_does_not_orphan_its_books(client: TestClient) -> None:
    """Same regression as shelves: books reference the tag by id."""
    tag = _tag(client, "Favourites").json()
    book_id = _book(client)
    _set_tags(client, book_id, [tag["id"]])

    renamed = client.patch(f"/tags/{tag['id']}", json={"name": "Keepers"})

    assert renamed.status_code == 200
    assert client.get(f"/books/{book_id}").json()["tag_ids"] == [tag["id"]]
    assert renamed.json()["book_count"] == 1


def test_an_admin_can_rename_a_global_tag(admin_client: TestClient) -> None:
    tag = _tag(admin_client, "SciFi", make_global=True).json()

    renamed = admin_client.patch(f"/tags/{tag['id']}", json={"name": "Science-Fiction"})

    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Science-Fiction"


# --- applying to books ----------------------------------------------------


def test_tags_can_be_set_and_replaced_wholesale(client: TestClient) -> None:
    first = _tag(client, "A").json()
    second = _tag(client, "B").json()
    book_id = _book(client)

    assert _set_tags(client, book_id, [first["id"], second["id"]]).status_code == 200
    assert client.get(f"/books/{book_id}").json()["tag_ids"] == sorted([first["id"], second["id"]])

    _set_tags(client, book_id, [first["id"]])
    assert client.get(f"/books/{book_id}").json()["tag_ids"] == [first["id"]]

    _set_tags(client, book_id, [])
    assert client.get(f"/books/{book_id}").json()["tag_ids"] == []


def test_omitting_tag_ids_leaves_tags_alone(client: TestClient) -> None:
    """Otherwise every progress update would strip a book's tags."""
    tag = _tag(client, "A").json()
    book_id = _book(client)
    _set_tags(client, book_id, [tag["id"]])

    client.put(f"/books/{book_id}/state", json={"rating": 4, "progress": 0.5})

    assert client.get(f"/books/{book_id}").json()["tag_ids"] == [tag["id"]]


def test_a_reader_cannot_apply_a_global_tag(admin_client: TestClient, client: TestClient) -> None:
    """Applying a global tag changes what the whole household sees, so it is
    curated through /tags rather than by whoever happens to be reading."""
    tag = _tag(admin_client, "Sci-Fi", make_global=True).json()
    book_id = _book(client)

    assert _set_tags(client, book_id, [tag["id"]]).status_code == 403


def test_an_admin_can_apply_a_global_tag(admin_client: TestClient) -> None:
    """Curating a shared vocabulary means being able to put it on a book.

    Nobody could, before: the refusal named an admin as the person who does
    this while refusing admins too, and no other endpoint assigns tags. A
    global tag could be created and then never used for anything.
    """
    tag = _tag(admin_client, "Sci-Fi", make_global=True).json()
    book_id = _book(admin_client)

    assert _set_tags(admin_client, book_id, [tag["id"]]).status_code == 200
    assert admin_client.get(f"/books/{book_id}").json()["tag_ids"] == [tag["id"]]
    listed = next(t for t in admin_client.get("/tags").json() if t["id"] == tag["id"])
    assert listed["book_count"] == 1


def test_an_admin_can_take_a_global_tag_off_again(admin_client: TestClient) -> None:
    """The half that makes the other half safe. This is a PUT: a tag left out
    of the list comes off. If the write could add a global tag while clearing
    only personal links, it would go on and never come off."""
    tag = _tag(admin_client, "Sci-Fi", make_global=True).json()
    book_id = _book(admin_client)
    _set_tags(admin_client, book_id, [tag["id"]])

    assert _set_tags(admin_client, book_id, []).status_code == 200
    assert admin_client.get(f"/books/{book_id}").json()["tag_ids"] == []


def test_a_global_tag_survives_a_readers_own_write(
    admin_client: TestClient, client: TestClient
) -> None:
    """A reader replaces their own tags and nothing else. The global tag on
    the book is not theirs to remove, and a PUT that omits it must leave it."""
    globaltag = _tag(admin_client, "Sci-Fi", make_global=True).json()
    book_id = _book(admin_client)
    _set_tags(admin_client, book_id, [globaltag["id"]])
    mine = _tag(client, "Mine").json()

    assert _set_tags(client, book_id, [mine["id"]]).status_code == 200

    assert client.get(f"/books/{book_id}").json()["tag_ids"] == sorted(
        [globaltag["id"], mine["id"]]
    )


def test_an_admins_write_leaves_another_readers_tags_alone(
    admin_client: TestClient, client: TestClient
) -> None:
    """The wider scope is global tags, not everybody's. An admin curating the
    shared vocabulary must not quietly strip a reader's private labels."""
    globaltag = _tag(admin_client, "Sci-Fi", make_global=True).json()
    book_id = _book(admin_client)
    theirs = _tag(client, "Beach").json()
    _set_tags(client, book_id, [theirs["id"]])

    _set_tags(admin_client, book_id, [globaltag["id"]])

    assert client.get(f"/books/{book_id}").json()["tag_ids"] == sorted(
        [globaltag["id"], theirs["id"]]
    )


def test_a_reader_cannot_apply_someone_elses_tag(
    client: TestClient, other_client: TestClient
) -> None:
    theirs = _tag(other_client, "Theirs").json()
    book_id = _book(client)

    assert _set_tags(client, book_id, [theirs["id"]]).status_code == 404


def test_setting_tags_does_not_disturb_another_readers(
    client: TestClient, other_client: TestClient, session: Session
) -> None:
    mine = _tag(client, "Mine").json()
    theirs = _tag(other_client, "Theirs").json()
    book_id = _book(client)

    _set_tags(client, book_id, [mine["id"]])
    _set_tags(other_client, book_id, [theirs["id"]])

    assert client.get(f"/books/{book_id}").json()["tag_ids"] == [mine["id"]]
    assert other_client.get(f"/books/{book_id}").json()["tag_ids"] == [theirs["id"]]


def test_a_books_tags_never_include_another_readers(
    client: TestClient, other_client: TestClient
) -> None:
    theirs = _tag(other_client, "Theirs").json()
    book_id = _book(client)
    _set_tags(other_client, book_id, [theirs["id"]])

    assert client.get(f"/books/{book_id}").json()["tag_ids"] == []
    assert client.get("/books").json()["items"][0]["tag_ids"] == []


# --- deletion -------------------------------------------------------------


def test_deleting_a_tag_removes_it_from_every_book(client: TestClient, session: Session) -> None:
    """No foreign-key cascade to lean on: SQLite has enforcement off, so the
    link rows have to go explicitly or they strand."""
    tag = _tag(client, "Doomed").json()
    for title in ("One", "Two"):
        _set_tags(client, _book(client, title), [tag["id"]])

    assert client.delete(f"/tags/{tag['id']}").status_code == 204

    assert session.exec(select(BookTag)).all() == []
    assert client.get("/tags").json() == []
