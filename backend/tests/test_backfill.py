"""The migrations that rewrite rows rather than schema.

Schema migrations are covered in test_migrations.py; these are about the rows.
Each test seeds a database at the revision *before* the one under test,
upgrades, and inspects what happened to data that already existed — the case a
fresh-install test can never reach.

Two migrations do this: the reading-state backfill, and the tag rename that
follows it.
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
# The tag table exists at this revision, and names may still hold spaces.
BEFORE_TAG_RENAME = "9a8d5d47149e"
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


def _add_admin(db_path: Path, user_id: int = 7, username: str = "keeper") -> None:
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "INSERT INTO user (id, username, password_hash, is_admin, created_at) "
            "VALUES (?, ?, 'x', 1, '2026-01-01')",
            (user_id, username),
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


# --- tag names without spaces ---------------------------------------------


@pytest.fixture(name="tagged_db")
def tagged_db_fixture(tmp_path: Path) -> Generator[Path, None, None]:
    """A database at the last revision that still allowed a space in a tag."""
    db_path = tmp_path / "tags.db"
    _alembic(db_path, BEFORE_TAG_RENAME)
    yield db_path


def _add_tag(db_path: Path, tag_id: int, name: str, owner_id: int | None = 7) -> None:
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "INSERT INTO tag (id, owner_id, name, created_at) VALUES (?, ?, ?, '2026-01-01')",
            (tag_id, owner_id, name),
        )


def _tag_names(db_path: Path) -> dict[int, str]:
    with sqlite3.connect(db_path) as conn:
        return {row[0]: row[1] for row in conn.execute("SELECT id, name FROM tag")}


def test_a_space_in_a_tag_name_becomes_a_hyphen(tagged_db: Path) -> None:
    """The name was reachable from the sidebar but never from the search box,
    which splits `#lent out` into a tag nobody has and a stray word."""
    _add_admin(tagged_db)
    _add_tag(tagged_db, 1, "lent out")
    _add_tag(tagged_db, 2, "already-fine")

    _upgrade(tagged_db)

    names = _tag_names(tagged_db)
    assert names[1] == "lent-out"
    # A name with nothing to fix is not rewritten, so its casing survives.
    assert names[2] == "already-fine"


def test_runs_of_whitespace_collapse_to_one_hyphen(tagged_db: Path) -> None:
    _add_admin(tagged_db)
    _add_tag(tagged_db, 1, "to   re-read")

    _upgrade(tagged_db)

    assert _tag_names(tagged_db)[1] == "to-re-read"


def test_a_rename_that_would_collide_gets_a_suffix(tagged_db: Path) -> None:
    """Both indexes on this table are NOCASE and unique. Hyphenating "lent
    out" straight onto the "Lent-Out" already there would fail the upgrade
    halfway, on somebody's real database, while their server was starting."""
    _add_admin(tagged_db)
    _add_tag(tagged_db, 1, "Lent-Out")
    _add_tag(tagged_db, 2, "lent out")

    _upgrade(tagged_db)

    names = _tag_names(tagged_db)
    assert names[1] == "Lent-Out"
    assert names[2] == "lent-out-2"


def test_two_readers_keep_their_own_copies_of_a_name(tagged_db: Path) -> None:
    """The unique index is per owner, so one reader's "lent out" does not
    crowd out another's — and the rename must not invent a clash across them."""
    _add_admin(tagged_db, user_id=7, username="keeper")
    _add_admin(tagged_db, user_id=8, username="roommate")
    _add_tag(tagged_db, 1, "lent out", owner_id=7)
    _add_tag(tagged_db, 2, "lent out", owner_id=8)

    _upgrade(tagged_db)

    assert _tag_names(tagged_db) == {1: "lent-out", 2: "lent-out"}
