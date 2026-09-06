"""The admin page's maintenance tab: what this installation holds, and the mess it has collected.

Nothing here is about normal use. Deleting a book already cleans up after itself
(#99); these are the leftovers of crashes, of earlier versions, and of sessions
that nobody ever swept up.
"""

from datetime import timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app import maintenance
from app.config import Settings
from app.models import User, UserSession, utcnow

BOOK_PAYLOAD = {"title": "Dune", "author": "Frank Herbert", "format": "epub"}


def _book(client: TestClient, stored_name: str) -> int:
    return client.post("/books", json={**BOOK_PAYLOAD, "file_path": stored_name}).json()["id"]


def _file(library_dir: Path, name: str, body: bytes = b"epub bytes") -> Path:
    library_dir.mkdir(parents=True, exist_ok=True)
    path = library_dir / name
    path.write_bytes(body)
    return path


def _report(client: TestClient) -> dict:
    response = client.get("/maintenance")
    assert response.status_code == 200
    return response.json()


def test_report_counts_what_the_installation_holds(
    admin_client: TestClient, library_dir: Path
) -> None:
    _file(library_dir, "one.epub", b"12345")
    _book(admin_client, "one.epub")
    admin_client.post("/shelves", json={"name": "Reading Now"})
    admin_client.post("/tags", json={"name": "fantasy"})

    body = _report(admin_client)

    assert body["books"] == 1
    assert body["shelves"] == 1
    assert body["tags"] == 1
    assert body["library_bytes"] == 5


def test_report_finds_a_file_no_book_points_at(admin_client: TestClient, library_dir: Path) -> None:
    """A crash between `storage.commit` and the insert leaves exactly this."""
    _file(library_dir, "kept.epub")
    _book(admin_client, "kept.epub")
    _file(library_dir, "stray.epub", b"abc")

    body = _report(admin_client)

    assert [orphan["name"] for orphan in body["orphan_files"]] == ["stray.epub"]
    assert body["orphan_files"][0]["size_bytes"] == 3


def test_report_finds_a_book_whose_file_is_gone(
    admin_client: TestClient, library_dir: Path
) -> None:
    """The other half of the same crash, and what a reader meets as "file is missing"."""
    _file(library_dir, "here.epub")
    _book(admin_client, "here.epub")
    missing_id = _book(admin_client, "gone.epub")

    body = _report(admin_client)

    assert [book["id"] for book in body["missing_files"]] == [missing_id]
    assert body["missing_files"][0]["file_path"] == "gone.epub"


def test_report_counts_only_the_sessions_that_have_expired(
    admin_client: TestClient, session: Session, library_dir: Path
) -> None:
    library_dir.mkdir(parents=True, exist_ok=True)
    user = session.exec(select(User)).first()
    assert user is not None
    session.add(UserSession(token_hash="live", user_id=user.id, expires_at=utcnow() + timedelta(1)))
    session.add(UserSession(token_hash="dead", user_id=user.id, expires_at=utcnow() - timedelta(1)))
    session.commit()

    assert _report(admin_client)["expired_sessions"] == 1


def test_pruning_removes_the_expired_sessions_and_leaves_the_live_ones(
    admin_client: TestClient, session: Session, library_dir: Path
) -> None:
    """Nothing else in the app ever deletes these, so they accumulate for the life of an install."""
    library_dir.mkdir(parents=True, exist_ok=True)
    user = session.exec(select(User)).first()
    assert user is not None
    session.add(UserSession(token_hash="live", user_id=user.id, expires_at=utcnow() + timedelta(1)))
    session.add(UserSession(token_hash="dead", user_id=user.id, expires_at=utcnow() - timedelta(1)))
    session.commit()

    response = admin_client.post("/maintenance/prune-sessions")

    assert response.status_code == 200
    assert response.json() == {"removed": 1}
    assert session.get(UserSession, "live") is not None
    assert session.get(UserSession, "dead") is None


def test_an_orphan_can_be_deleted_one_at_a_time(
    admin_client: TestClient, library_dir: Path
) -> None:
    stray = _file(library_dir, "stray.epub")

    response = admin_client.delete("/maintenance/orphans/stray.epub")

    assert response.status_code == 204
    assert not stray.exists()
    assert _report(admin_client)["orphan_files"] == []


def test_a_file_a_book_still_points_at_is_never_deleted_as_an_orphan(
    admin_client: TestClient, library_dir: Path
) -> None:
    """The report and the delete are two requests, and a book can arrive between them."""
    kept = _file(library_dir, "kept.epub")
    _book(admin_client, "kept.epub")

    response = admin_client.delete("/maintenance/orphans/kept.epub")

    assert response.status_code == 409
    assert kept.exists()


def test_a_name_that_climbs_out_of_the_library_is_refused(
    session: Session, settings: Settings
) -> None:
    """The name comes from a caller, so it is untrusted however it was offered.

    Checked against the function rather than the endpoint, because the endpoint
    never gets the chance: a name carrying a slash does not match
    `/maintenance/orphans/{name}` at all, and the router answers 405. That is a
    second wall, not this one — the guard being tested is the one that would
    still hold if the route ever took a path.
    """
    settings.library_dir.mkdir(parents=True, exist_ok=True)
    outside = settings.library_dir.parent / "secrets.txt"
    outside.write_bytes(b"not yours")

    with pytest.raises(maintenance.OrphanNotFoundError):
        maintenance.delete_orphan(session, "../secrets.txt", settings)

    assert outside.exists()


def test_vacuum_answers_and_leaves_the_data_alone(
    admin_client: TestClient, library_dir: Path
) -> None:
    _file(library_dir, "one.epub")
    book_id = _book(admin_client, "one.epub")

    assert admin_client.post("/maintenance/vacuum").status_code == 204
    assert admin_client.get(f"/books/{book_id}").status_code == 200


def test_every_maintenance_route_is_admin_only(client: TestClient, library_dir: Path) -> None:
    library_dir.mkdir(parents=True, exist_ok=True)

    assert client.get("/maintenance").status_code == 403
    assert client.post("/maintenance/prune-sessions").status_code == 403
    assert client.post("/maintenance/vacuum").status_code == 403
    assert client.delete("/maintenance/orphans/anything.epub").status_code == 403
