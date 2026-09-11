"""What an installation holds, and the leftovers nothing else sweeps up.

Its own module rather than more of `app/library.py`: that file is the library's
own operations, and this is about the shape of the installation around them.

Everything here is about damage, not about normal use. Deleting a book already
takes its file and its rows with it. What collects instead is the residue of a
crash between writing a file and inserting its row, of versions before that was
true, and of sessions that expire and are then never removed by anything.
"""

import os
from datetime import datetime
from pathlib import Path

from sqlalchemy import func, text
from sqlmodel import Session, col, select

from app import storage
from app.config import Settings
from app.models import (
    Book,
    MaintenanceReport,
    MissingFile,
    Note,
    OrphanFile,
    Shelf,
    Tag,
    User,
    UserSession,
    utcnow,
)


class OrphanNotFoundError(Exception):
    """No such file in the library directory."""


class FileStillInUseError(Exception):
    """A book points at that file, so it is not an orphan."""


def _count(session: Session, model: type) -> int:
    return session.exec(select(func.count()).select_from(model)).one()


def _library_files(library_dir: Path) -> list[Path]:
    """Every file sitting directly in the library directory.

    Directly, and not a walk: `storage.commit` writes `{uuid}.epub` into the
    root, and custom covers into `covers/` beside it. A cover is not an orphan
    and must never be offered for deletion here, so the subdirectory is
    skipped — `iterdir` lists it, and `is_file` rejects it.
    """
    if not library_dir.is_dir():
        return []
    return sorted(path for path in library_dir.iterdir() if path.is_file())


def _still_there(paths: list[Path]) -> list[tuple[Path, os.stat_result]]:
    """Each file with its size and times, read once, leaving out any that is gone by then."""
    found = []
    for path in paths:
        try:
            found.append((path, path.stat()))
        except FileNotFoundError:
            # An upload renames or deletes its own `.part` file when it finishes, at any moment.
            continue
    return found


def report(session: Session, settings: Settings) -> MaintenanceReport:
    """Everything the maintenance tab shows, in one read.

    Args:
        session: Open database session.
        settings: Supplies `library_dir`.
    """
    books = session.exec(select(Book)).all()
    stored_names = {book.file_path for book in books}
    files = _still_there(_library_files(settings.library_dir))

    orphans = [
        OrphanFile(
            name=path.name,
            size_bytes=info.st_size,
            modified_at=datetime.fromtimestamp(info.st_mtime),
        )
        for path, info in files
        if path.name not in stored_names
    ]

    missing = [
        MissingFile(id=book.id, title=book.title, file_path=book.file_path)
        for book in books
        if book.id is not None and not _is_present(book.file_path, settings)
    ]

    return MaintenanceReport(
        books=len(books),
        users=_count(session, User),
        shelves=_count(session, Shelf),
        tags=_count(session, Tag),
        notes=_count(session, Note),
        library_bytes=sum(info.st_size for _, info in files),
        expired_sessions=len(_expired(session)),
        orphan_files=orphans,
        missing_files=missing,
    )


def _is_present(file_path: str, settings: Settings) -> bool:
    try:
        return storage.resolve(file_path, settings.library_dir).is_file()
    except ValueError:
        # A stored path that climbs out of the library is not a file this
        # installation has; it is a row to report, which is what False does.
        return False


def _expired(session: Session) -> list[UserSession]:
    return list(session.exec(select(UserSession).where(UserSession.expires_at < utcnow())).all())


def prune_sessions(session: Session) -> int:
    """Delete every session that has already expired; returns how many went.

    Args:
        session: Open database session.

    Returns:
        How many rows were removed.
    """
    expired = _expired(session)
    for stale in expired:
        session.delete(stale)
    session.commit()
    return len(expired)


def delete_orphan(session: Session, name: str, settings: Settings) -> None:
    """Remove one file that no book points at.

    The name comes from a caller, so it is checked twice over: `storage.resolve`
    refuses one that climbs out of the library directory, and the book table is
    asked again in case one arrived between the report and this request.

    Args:
        session: Open database session.
        name: The file's name inside the library directory.
        settings: Supplies `library_dir`.

    Raises:
        OrphanNotFoundError: Nothing of that name is there.
        FileStillInUseError: A book points at it, so it is not an orphan.
    """
    try:
        path = storage.resolve(name, settings.library_dir)
    except ValueError as exc:
        raise OrphanNotFoundError from exc

    if not path.is_file():
        raise OrphanNotFoundError

    if session.exec(select(Book).where(col(Book.file_path) == name)).first() is not None:
        raise FileStillInUseError

    path.unlink()


def _database_file(settings: Settings) -> Path | None:
    """The database as a file on disk, or None when it is not one.

    `sqlite:///./libra.db` is a file; `sqlite://` is the in-memory database the
    test suite runs on, and has no size to measure.
    """
    prefix = "sqlite:///"
    if not settings.database_url.startswith(prefix):
        return None
    path = Path(settings.database_url[len(prefix) :])
    return path if path.is_file() else None


def vacuum(session: Session, settings: Settings) -> int:
    """Ask SQLite to give back the space deleted rows left behind.

    Args:
        session: Open database session.
        settings: Supplies `database_url`, to measure the file either side.

    Returns:
        How many bytes the file shrank by. Zero when there was nothing to
        reclaim, and zero for an in-memory database, which has no file.
    """
    database = _database_file(settings)
    before = database.stat().st_size if database else 0

    session.commit()
    session.exec(text("VACUUM"))

    after = database.stat().st_size if database else 0
    return max(0, before - after)
