"""The admin page's maintenance tab: what this installation holds, and the mess it has collected.

Nothing here is about normal use. Deleting a book already cleans up after itself
(#99); these are the leftovers of crashes, of earlier versions, and of sessions
that nobody ever swept up.
"""

import io
from datetime import timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app import maintenance, storage
from app.config import Settings
from app.models import Book, User, UserSession, utcnow

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


def test_a_file_that_goes_away_while_the_report_is_built_is_left_out(
    admin_client: TestClient, library_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """An upload's staging file goes away by itself: renamed if kept, deleted if refused."""
    _file(library_dir, "stray.epub", b"12345")
    staged = storage.stage_upload(io.BytesIO(b"half a book"), library_dir, max_bytes=1024)
    list_files = maintenance._library_files

    def list_then_refuse_the_upload(directory: Path) -> list[Path]:
        listed = list_files(directory)
        staged.discard()
        return listed

    monkeypatch.setattr(maintenance, "_library_files", list_then_refuse_the_upload)

    body = _report(admin_client)

    assert [orphan["name"] for orphan in body["orphan_files"]] == ["stray.epub"]
    assert body["library_bytes"] == 5


def test_an_upload_left_half_written_by_a_crash_is_still_an_orphan(
    admin_client: TestClient, library_dir: Path
) -> None:
    """Its staging file is the residue this tab exists to show, so it is not hidden."""
    staged = storage.stage_upload(io.BytesIO(b"half a book"), library_dir, max_bytes=1024)

    body = _report(admin_client)

    assert [orphan["name"] for orphan in body["orphan_files"]] == [staged.path.name]


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


def test_vacuum_says_how_much_it_reclaimed_and_leaves_the_data_alone(
    admin_client: TestClient, library_dir: Path
) -> None:
    """The suite runs on an in-memory database, which has no file to measure — hence zero."""
    _file(library_dir, "one.epub")
    book_id = _book(admin_client, "one.epub")

    response = admin_client.post("/maintenance/vacuum")

    assert response.status_code == 200
    assert response.json() == {"reclaimed_bytes": 0}
    assert admin_client.get(f"/books/{book_id}").status_code == 200


def test_vacuum_measures_a_real_file_either_side(session: Session, tmp_path: Path) -> None:
    """The half the in-memory suite cannot see: a database that is a file, and shrinks.

    Written against a database of its own rather than the fixture's, because the
    fixture's is `sqlite://` — in memory, and never a file.
    """
    from sqlmodel import SQLModel, create_engine

    database = tmp_path / "measured.db"
    engine = create_engine(f"sqlite:///{database}")
    SQLModel.metadata.create_all(engine)
    with Session(engine) as own:
        for index in range(500):
            own.add(Book(title=f"Book {index}", author="A", format="epub", file_path=f"{index}.e"))
        own.commit()
        for book in own.exec(select(Book)).all():
            own.delete(book)
        own.commit()

        reclaimed = maintenance.vacuum(
            own, Settings(database_url=f"sqlite:///{database}", library_dir=tmp_path / "library")
        )

    assert reclaimed > 0


def test_every_maintenance_route_is_admin_only(client: TestClient, library_dir: Path) -> None:
    library_dir.mkdir(parents=True, exist_ok=True)

    assert client.get("/maintenance").status_code == 403
    assert client.post("/maintenance/prune-sessions").status_code == 403
    assert client.post("/maintenance/vacuum").status_code == 403
    assert client.delete("/maintenance/orphans/anything.epub").status_code == 403
