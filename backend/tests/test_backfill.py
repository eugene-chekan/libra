"""The data backfills in the reading-state migration.

Schema migrations are covered in test_migrations.py; these are about the rows.
Each test seeds a database at the *previous* revision, upgrades, and inspects
what happened to data that already existed — the case a fresh-install test
can never reach.
"""

import json
import os
import sqlite3
import subprocess
import sys
from collections.abc import Generator
from pathlib import Path

import pytest

PREVIOUS_REVISION = "d34d899bf315"
BACKEND = Path(__file__).resolve().parent.parent


def _alembic(db_path: Path, target: str) -> None:
    """Run alembic against `db_path` in a subprocess.

    Out of process on purpose: the migration must work against a database
    nothing has opened with the app's engine, and an in-process run shares
    SQLModel's metadata, which could mask a revision that only appears to
    work because the models were already loaded.
    """
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", target],
        cwd=BACKEND,
        env={**os.environ, "LIBRA_DATABASE_URL": f"sqlite:///{db_path}"},
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise AssertionError(f"alembic upgrade {target} failed:\n{result.stderr}")


@pytest.fixture(name="legacy_db")
def legacy_db_fixture(tmp_path: Path) -> Generator[Path, None, None]:
    """A database at the revision before reading state, ready to be seeded."""
    db_path = tmp_path / "legacy.db"
    _alembic(db_path, PREVIOUS_REVISION)
    yield db_path


def _upgrade(db_path: Path) -> None:
    _alembic(db_path, "head")


def _add_admin(db_path: Path, user_id: int = 7) -> None:
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "INSERT INTO user (id, username, password_hash, is_admin, created_at) "
            "VALUES (?, 'keeper', 'x', 1, '2026-01-01')",
            (user_id,),
        )


def _add_book(db_path: Path, book_id: int, metadata: dict) -> None:
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "INSERT INTO book (id, title, author, format, file_path, book_metadata) "
            "VALUES (?, 'T', 'A', 'epub', ?, ?)",
            (book_id, f"{book_id}.epub", json.dumps(metadata)),
        )


def _book(db_path: Path, book_id: int) -> dict:
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM book WHERE id = ?", (book_id,)).fetchone()
    return dict(row)


def test_description_moves_out_of_the_blob(legacy_db: Path) -> None:
    """Leaving a copy behind would let an admin edit `blurb` and strand a
    stale contradicting value for a later reader to prefer."""
    _add_book(legacy_db, 1, {"description": "Desert planet politics.", "language": "en"})

    _upgrade(legacy_db)

    book = _book(legacy_db, 1)
    assert book["blurb"] == "Desert planet politics."
    assert "description" not in json.loads(book["book_metadata"])
    # Unrelated keys are untouched.
    assert json.loads(book["book_metadata"])["language"] == "en"


@pytest.mark.parametrize(
    ("published", "expected_year"),
    [
        ("1965-08-01", 1965),
        ("2011", 2011),
        ("2011-01-01T00:00:00+00:00", 2011),
        # Calibre's "date unknown" sentinel. A library full of AD 101 books is
        # worse than a library of blanks.
        ("0101-01-01T00:00:00+00:00", None),
        # Malformed date, not the year 2011.
        ("20110101", None),
        # Deliberately not handled: the backfill is narrower than the parser,
        # because copying the full rule into a migration would freeze a
        # duplicate of application logic that is free to change.
        ("August 1965", None),
    ],
)
def test_year_backfilled_from_the_raw_date(
    legacy_db: Path, published: str, expected_year: int | None
) -> None:
    _add_book(legacy_db, 1, {"published": published})

    _upgrade(legacy_db)

    book = _book(legacy_db, 1)
    assert book["year"] == expected_year
    # The raw string stays regardless, so a blank year remains recoverable.
    assert json.loads(book["book_metadata"])["published"] == published


def test_existing_books_are_attributed_to_the_admin(legacy_db: Path) -> None:
    _add_admin(legacy_db, user_id=7)
    _add_book(legacy_db, 1, {})

    _upgrade(legacy_db)

    assert _book(legacy_db, 1)["uploaded_by"] == 7


def test_attribution_is_a_no_op_when_no_admin_exists(legacy_db: Path) -> None:
    """The case that would otherwise break startup mid-upgrade.

    `app.cli.create_admin` runs migrations *before* creating the user, so a
    database with books and no admin is reachable — anyone who upgraded
    through #4 and has not yet bootstrapped is in exactly that state. Since
    `uploaded_by` is provenance and nullable by design, an unattributed book
    is a valid row and the backfill must simply decline.
    """
    _add_book(legacy_db, 1, {})

    _upgrade(legacy_db)  # must not raise

    assert _book(legacy_db, 1)["uploaded_by"] is None


def test_the_migration_never_invents_an_admin(legacy_db: Path) -> None:
    """An ebook server that mints its own admin account is the hole the CLI
    bootstrap exists to close; a migration must not reopen it."""
    _add_book(legacy_db, 1, {})

    _upgrade(legacy_db)

    with sqlite3.connect(legacy_db) as conn:
        assert conn.execute("SELECT count(*) FROM user").fetchone()[0] == 0
