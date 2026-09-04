"""Filtering and sorting the library.

The semantics are the design's, not ours: tag filters OR each other, and the
text query ANDs against that result. Phase 3's `search_library` calls the same
function, so a scoping mistake here is a scoping mistake in the agent too.
"""

from fastapi.testclient import TestClient

BOOK_PAYLOAD = {
    "format": "epub",
    "file_path": "x.epub",
    "book_metadata": {},
}


def _book(client: TestClient, title: str, author: str = "Frank Herbert") -> int:
    return client.post(
        "/books",
        json={**BOOK_PAYLOAD, "title": title, "author": author, "file_path": f"{title}.epub"},
    ).json()["id"]


def _tag(client: TestClient, name: str, make_global: bool = False) -> int:
    suffix = "?make_global=true" if make_global else ""
    return client.post(f"/tags{suffix}", json={"name": name}).json()["id"]


def _apply(client: TestClient, book_id: int, tag_ids: list[int]) -> None:
    client.put(f"/books/{book_id}/state", json={"rating": 0, "progress": 0, "tag_ids": tag_ids})


def _titles(response) -> list[str]:
    return [item["title"] for item in response.json()["items"]]


# --- text ------------------------------------------------------------------


def test_query_matches_title_or_author(client: TestClient) -> None:
    _book(client, "Dune", "Frank Herbert")
    _book(client, "Neuromancer", "William Gibson")

    assert _titles(client.get("/books?q=dune")) == ["Dune"]
    assert _titles(client.get("/books?q=gibson")) == ["Neuromancer"]


def test_query_is_case_insensitive_and_substring(client: TestClient) -> None:
    _book(client, "The Left Hand of Darkness", "Ursula K. Le Guin")

    assert len(client.get("/books?q=LEFT hand").json()["items"]) == 1
    assert len(client.get("/books?q=guin").json()["items"]) == 1


def test_case_is_ignored_in_every_alphabet_not_only_english(client: TestClient) -> None:
    """SQLite's own `lower()` folds the 26 ASCII letters and leaves the rest alone.

    `app/db.py` replaces it with Python's `casefold`, which is the only reason
    these pass. A library is not an English-only thing.
    """
    _book(client, "Долгая прогулка", "Стивен Кинг")
    _book(client, "Café Terrace", "Édouard Manet")

    assert _titles(client.get("/books?q=долгая")) == ["Долгая прогулка"]
    assert _titles(client.get("/books?q=ДОЛГАЯ")) == ["Долгая прогулка"]
    assert _titles(client.get("/books?q=кинг")) == ["Долгая прогулка"]
    assert _titles(client.get("/books?q=CAFÉ")) == ["Café Terrace"]
    assert _titles(client.get("/books?q=édouard")) == ["Café Terrace"]


def test_matching_folds_case_rather_than_lowercasing_it(client: TestClient) -> None:
    """`casefold`, not `lower`: German ß has no capital, and is written SS instead.

    Somebody typing a title on a keyboard without ß should still find the book.
    This is the one case where the two differ, and it is why `app/db.py` uses
    the stricter of the pair.
    """
    _book(client, "Die Straße", "Rainer Maria Rilke")

    assert _titles(client.get("/books?q=strasse")) == ["Die Straße"]
    assert _titles(client.get("/books?q=STRASSE")) == ["Die Straße"]


def test_a_query_matching_nothing_returns_an_empty_envelope(client: TestClient) -> None:
    _book(client, "Dune")

    body = client.get("/books?q=nothing-like-this").json()

    assert body["items"] == []
    assert body["total"] == 0


def test_blank_query_is_not_a_filter(client: TestClient) -> None:
    _book(client, "Dune")

    assert client.get("/books?q=   ").json()["total"] == 1


# --- tags ------------------------------------------------------------------


def test_tag_filters_or_each_other(client: TestClient) -> None:
    """A book matches if it carries ANY of the given tags — the design's rule."""
    sci_fi = _tag(client, "Sci-Fi")
    fantasy = _tag(client, "Fantasy")
    _apply(client, _book(client, "Dune"), [sci_fi])
    _apply(client, _book(client, "Babel"), [fantasy])
    _book(client, "Untagged")

    both = client.get(f"/books?tags={sci_fi},{fantasy}")

    assert sorted(_titles(both)) == ["Babel", "Dune"]


def test_text_ands_against_the_tag_result(client: TestClient) -> None:
    sci_fi = _tag(client, "Sci-Fi")
    _apply(client, _book(client, "Dune"), [sci_fi])
    _apply(client, _book(client, "Neuromancer"), [sci_fi])

    assert _titles(client.get(f"/books?tags={sci_fi}&q=dune")) == ["Dune"]


def test_filtering_by_a_global_tag_works_for_everyone(
    admin_client: TestClient, client: TestClient
) -> None:
    tag_id = _tag(admin_client, "Sci-Fi", make_global=True)
    book_id = _book(admin_client, "Dune")
    _apply(admin_client, book_id, [])  # readers cannot apply globals
    # An admin applies it through the same state endpoint they are allowed to.
    admin_client.put(f"/books/{book_id}/state", json={"rating": 0, "progress": 0})

    # The tag is visible to an ordinary reader even though they cannot apply it.
    assert client.get(f"/books?tags={tag_id}").status_code == 200


def test_filtering_by_another_readers_tag_is_404_not_an_empty_list(
    client: TestClient, other_client: TestClient
) -> None:
    """An empty result would confirm the tag exists, which is enough to
    enumerate someone's private vocabulary by walking ids."""
    theirs = _tag(other_client, "Theirs")

    assert client.get(f"/books?tags={theirs}").status_code == 404


def test_filtering_by_a_nonexistent_tag_is_404(client: TestClient) -> None:
    assert client.get("/books?tags=9999").status_code == 404


def test_a_malformed_tag_list_is_422(client: TestClient) -> None:
    assert client.get("/books?tags=abc").status_code == 422


def test_another_readers_tag_assignment_does_not_match(
    client: TestClient, other_client: TestClient
) -> None:
    """Both readers have a tag of their own on the same book; each filter must
    see only their own assignment."""
    book_id = _book(client, "Dune")
    mine = _tag(client, "Mine")
    theirs = _tag(other_client, "Theirs")
    _apply(client, book_id, [mine])
    _apply(other_client, book_id, [theirs])

    assert _titles(client.get(f"/books?tags={mine}")) == ["Dune"]
    assert _titles(other_client.get(f"/books?tags={theirs}")) == ["Dune"]


# --- shelves ---------------------------------------------------------------


def test_filtering_by_shelf(client: TestClient) -> None:
    shelf_id = client.post("/shelves", json={"name": "To Read"}).json()["id"]
    book_id = _book(client, "Dune")
    _book(client, "Elsewhere")
    client.put(f"/books/{book_id}/state", json={"rating": 0, "progress": 0, "shelf_id": shelf_id})

    assert _titles(client.get(f"/books?shelf_id={shelf_id}")) == ["Dune"]


def test_filtering_by_a_private_shelf_of_anothers_is_404(
    client: TestClient, other_client: TestClient
) -> None:
    theirs = other_client.post("/shelves", json={"name": "Secret"}).json()["id"]

    assert client.get(f"/books?shelf_id={theirs}").status_code == 404


def test_filtering_by_a_public_shelf_shows_its_contents(
    client: TestClient, other_client: TestClient
) -> None:
    """The point of publishing a shelf: others can see what is on it."""
    shelf_id = other_client.post(
        "/shelves", json={"name": "Recommended", "visibility": "public"}
    ).json()["id"]
    book_id = _book(other_client, "Dune")
    _book(other_client, "Elsewhere")
    other_client.put(
        f"/books/{book_id}/state", json={"rating": 0, "progress": 0, "shelf_id": shelf_id}
    )

    assert _titles(client.get(f"/books?shelf_id={shelf_id}")) == ["Dune"]


# --- sorting ---------------------------------------------------------------


def test_default_sort_is_by_title(client: TestClient) -> None:
    _book(client, "Zebra")
    _book(client, "apple")
    _book(client, "Mango")

    # NOCASE, so "apple" sorts with the A's rather than after every capital.
    assert _titles(client.get("/books")) == ["apple", "Mango", "Zebra"]


def test_sort_by_added_is_most_recent_first(client: TestClient) -> None:
    _book(client, "First")
    _book(client, "Second")
    _book(client, "Third")

    assert _titles(client.get("/books?sort=added")) == ["Third", "Second", "First"]


def test_an_unknown_sort_is_rejected(client: TestClient) -> None:
    assert client.get("/books?sort=sideways").status_code == 422


# --- combined --------------------------------------------------------------


def test_filters_combine(client: TestClient) -> None:
    shelf_id = client.post("/shelves", json={"name": "To Read"}).json()["id"]
    tag_id = _tag(client, "Sci-Fi")

    wanted = _book(client, "Dune", "Frank Herbert")
    _apply(client, wanted, [tag_id])
    client.put(f"/books/{wanted}/state", json={"rating": 0, "progress": 0, "shelf_id": shelf_id})

    # Same tag and shelf, wrong author for the text query.
    other = _book(client, "Neuromancer", "William Gibson")
    _apply(client, other, [tag_id])
    client.put(f"/books/{other}/state", json={"rating": 0, "progress": 0, "shelf_id": shelf_id})

    body = client.get(f"/books?tags={tag_id}&shelf_id={shelf_id}&q=herbert").json()

    assert [item["title"] for item in body["items"]] == ["Dune"]
    assert body["total"] == 1


def test_results_still_carry_the_callers_own_state(client: TestClient) -> None:
    """Filtering must not lose the per-user merge."""
    book_id = _book(client, "Dune")
    client.put(f"/books/{book_id}/state", json={"rating": 5, "progress": 0.5})

    item = client.get("/books?q=dune").json()["items"][0]

    assert item["rating"] == 5
    assert item["progress"] == 0.5
