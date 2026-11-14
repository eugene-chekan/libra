"""The migrations that rewrite rows rather than schema.

Schema migrations are covered in test_migrations.py; these are about the rows.
Each test seeds a database at the revision *before* the one under test,
upgrades, and inspects what happened to data that already existed — the case a
fresh-install test can never reach.

Six migrations do this: the reading-state backfill, the tag rename that
follows it, the name fold, the clearing of years that were really a file's
own timestamp, the clearing of conversations left by deleted users, and the
repairs that come before the check constraints.
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
# Names are still unique under NOCASE at this revision, so two that differ
# only in a non-English letter's case can both be seeded.
BEFORE_NAME_FOLD = "8be05e88e049"
# The last revision whose books still kept a year read from a file timestamp.
BEFORE_FILE_DATE_YEARS = "fcb90b64ac72"
# The last revision that kept a conversation after its user was deleted.
BEFORE_STRAY_CONVERSATIONS = "ede8e57ae05c"
# The last revision whose tables accept a value outside its range.
BEFORE_CHECK_CONSTRAINTS = "c06126bfeef6"
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


# --- folding names in every alphabet --------------------------------------


@pytest.fixture(name="unfolded_db")
def unfolded_db_fixture(tmp_path: Path) -> Generator[Path, None, None]:
    """A database at the last revision whose names were unique under NOCASE."""
    db_path = tmp_path / "folding.db"
    _alembic(db_path, BEFORE_NAME_FOLD)
    yield db_path


def _add_shelf(db_path: Path, shelf_id: int, name: str, owner_id: int = 7) -> None:
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "INSERT INTO shelf (id, owner_id, name, position, visibility, created_at) "
            "VALUES (?, ?, ?, 0, 'private', '2026-01-01')",
            (shelf_id, owner_id, name),
        )


def _names(db_path: Path, table: str) -> dict[int, tuple[str, str]]:
    """Every row's displayed name and its folded form."""
    with sqlite3.connect(db_path) as conn:
        return {
            row[0]: (row[1], row[2])
            for row in conn.execute(f"SELECT id, name, name_folded FROM {table}")  # noqa: S608
        }


def test_the_folded_name_is_filled_in_for_rows_that_already_existed(
    unfolded_db: Path,
) -> None:
    _add_admin(unfolded_db)
    _add_tag(unfolded_db, 1, "Фантастика")

    _upgrade(unfolded_db)

    assert _names(unfolded_db, "tag")[1] == (
        "Фантастика",
        "фантастика",
    )


def test_two_tags_that_now_clash_keep_the_older_name(unfolded_db: Path) -> None:
    """The new index cannot be built while both stand. Failing instead would
    fail during startup, on somebody's real database."""
    _add_admin(unfolded_db)
    _add_tag(unfolded_db, 1, "Фантастика")
    _add_tag(unfolded_db, 2, "фантастика")

    _upgrade(unfolded_db)

    names = _names(unfolded_db, "tag")
    assert names[1][0] == "Фантастика"
    assert names[2][0] == "фантастика-2"


def test_a_third_clashing_name_counts_up_rather_than_colliding_again(
    unfolded_db: Path,
) -> None:
    _add_admin(unfolded_db)
    _add_tag(unfolded_db, 1, "Книги")
    _add_tag(unfolded_db, 2, "книги")
    _add_tag(unfolded_db, 3, "КНИГИ")

    _upgrade(unfolded_db)

    folded = [pair[1] for pair in _names(unfolded_db, "tag").values()]
    assert len(set(folded)) == 3


def test_shelves_that_now_clash_are_resolved_the_same_way(unfolded_db: Path) -> None:
    _add_admin(unfolded_db)
    _add_shelf(unfolded_db, 1, "Прочитано")
    _add_shelf(unfolded_db, 2, "прочитано")

    _upgrade(unfolded_db)

    names = _names(unfolded_db, "shelf")
    assert names[1][0] == "Прочитано"
    assert names[2][0] == "прочитано-2"


def test_two_readers_may_still_each_have_the_same_name(unfolded_db: Path) -> None:
    """Uniqueness is per owner. The fold must not invent a clash across them."""
    _add_admin(unfolded_db, user_id=7, username="keeper")
    _add_admin(unfolded_db, user_id=8, username="roommate")
    _add_shelf(unfolded_db, 1, "Прочитано", owner_id=7)
    _add_shelf(unfolded_db, 2, "Прочитано", owner_id=8)

    _upgrade(unfolded_db)

    names = _names(unfolded_db, "shelf")
    assert names[1][0] == names[2][0] == "Прочитано"


# --- years that were really a file's own timestamp ------------------------


@pytest.fixture(name="timestamped_db")
def timestamped_db_fixture(tmp_path: Path) -> Generator[Path, None, None]:
    """A database at the last revision that kept a build year as the year."""
    db_path = tmp_path / "years.db"
    _alembic(db_path, BEFORE_FILE_DATE_YEARS)
    yield db_path


def _add_dated_book(db_path: Path, book_id: int, year: int, metadata: dict) -> None:
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "INSERT INTO book (id, title, author, format, file_path, year, book_metadata) "
            "VALUES (?, 'T', 'A', 'epub', ?, ?, ?)",
            (book_id, f"{book_id}.epub", year, json.dumps(metadata)),
        )


@pytest.mark.parametrize("publisher", ["Standard Ebooks", "standard ebooks"])
def test_a_build_year_is_cleared(timestamped_db: Path, publisher: str) -> None:
    """The year this publisher's books arrived with is the moment the file was
    built, not the year the work came out."""
    raw = {"publisher": publisher, "published": "2023-02-21T03:11:20Z"}
    _add_dated_book(timestamped_db, 1, year=2023, metadata=raw)

    _upgrade(timestamped_db)

    book = _book(timestamped_db, 1)
    assert book["year"] is None
    # The date the file gave stays, so a blank year is still traceable.
    assert json.loads(book["book_metadata"]) == raw


def test_another_publishers_year_is_left_alone(timestamped_db: Path) -> None:
    _add_dated_book(
        timestamped_db, 1, year=1965, metadata={"publisher": "Ace Books", "published": "1965-08-01"}
    )

    _upgrade(timestamped_db)

    assert _book(timestamped_db, 1)["year"] == 1965


def test_another_publishers_timestamp_is_left_alone(timestamped_db: Path) -> None:
    """The everyday Calibre row: a real publication date written as a midnight
    timestamp. Only the named publisher's timestamps are the build's."""
    _add_dated_book(
        timestamped_db,
        1,
        year=1965,
        metadata={"publisher": "Ace Books", "published": "1965-08-01T00:00:00+00:00"},
    )

    _upgrade(timestamped_db)

    assert _book(timestamped_db, 1)["year"] == 1965


def test_a_year_corrected_by_hand_is_kept(timestamped_db: Path) -> None:
    """1839 is not the year in the file, so somebody typed it. A migration
    must not undo a reader's own work."""
    _add_dated_book(
        timestamped_db,
        1,
        year=1839,
        metadata={"publisher": "Standard Ebooks", "published": "2023-09-23T15:21:00Z"},
    )

    _upgrade(timestamped_db)

    assert _book(timestamped_db, 1)["year"] == 1839


def test_a_date_without_a_time_of_day_is_kept(timestamped_db: Path) -> None:
    """A plain year was typed by a person; only a timestamp is the build's."""
    _add_dated_book(
        timestamped_db, 1, year=1839, metadata={"publisher": "Standard Ebooks", "published": "1839"}
    )

    _upgrade(timestamped_db)

    assert _book(timestamped_db, 1)["year"] == 1839


def test_a_book_with_no_stored_date_survives_the_upgrade(timestamped_db: Path) -> None:
    """The blob holds whatever the file said, which can be nothing at all."""
    _add_dated_book(timestamped_db, 1, year=1965, metadata={})

    _upgrade(timestamped_db)  # must not raise

    assert _book(timestamped_db, 1)["year"] == 1965


@pytest.fixture(name="chatty_db")
def chatty_db_fixture(tmp_path: Path) -> Generator[Path, None, None]:
    """A database that may still hold a deleted user's conversation."""
    db_path = tmp_path / "chatty.db"
    _alembic(db_path, BEFORE_STRAY_CONVERSATIONS)
    yield db_path


def _add_conversation(db_path: Path, conversation_id: int, user_id: int, created_at: str) -> None:
    """Add a conversation holding one message."""
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "INSERT INTO conversation (id, user_id, created_at) VALUES (?, ?, ?)",
            (conversation_id, user_id, created_at),
        )
        conn.execute(
            "INSERT INTO message (conversation_id, role, content, created_at) "
            "VALUES (?, 'user', 'A private one.', ?)",
            (conversation_id, created_at),
        )


def _conversation_ids(db_path: Path) -> tuple[list[int], list[int]]:
    """The conversations left, and the conversations the messages left belong to."""
    with sqlite3.connect(db_path) as conn:
        conversations = [row[0] for row in conn.execute("SELECT id FROM conversation")]
        messages = [row[0] for row in conn.execute("SELECT conversation_id FROM message")]
    return conversations, messages


def test_a_conversation_whose_user_is_gone_is_cleared(chatty_db: Path) -> None:
    _add_conversation(chatty_db, 1, user_id=99, created_at="2026-03-01 10:00:00.000000")

    _upgrade(chatty_db)

    assert _conversation_ids(chatty_db) == ([], [])


def test_a_conversation_older_than_its_account_is_cleared(chatty_db: Path) -> None:
    """The account got the id of a deleted one, and the conversation with it."""
    _add_admin(chatty_db)
    _add_conversation(chatty_db, 1, user_id=7, created_at="2025-12-31 23:59:59.000000")

    _upgrade(chatty_db)

    assert _conversation_ids(chatty_db) == ([], [])


def test_a_readers_own_conversation_is_kept(chatty_db: Path) -> None:
    _add_admin(chatty_db)
    _add_conversation(chatty_db, 1, user_id=7, created_at="2026-03-01 10:00:00.000000")

    _upgrade(chatty_db)

    assert _conversation_ids(chatty_db) == ([1], [1])


def test_a_message_with_no_conversation_is_cleared(chatty_db: Path) -> None:
    _add_admin(chatty_db)
    _add_conversation(chatty_db, 1, user_id=7, created_at="2026-03-01 10:00:00.000000")
    with sqlite3.connect(chatty_db) as conn:
        conn.execute(
            "INSERT INTO message (conversation_id, role, content, created_at) "
            "VALUES (50, 'user', 'Lost.', '2026-03-01')"
        )

    _upgrade(chatty_db)

    assert _conversation_ids(chatty_db) == ([1], [1])


def test_values_out_of_range_are_repaired_not_fatal(tmp_path: Path) -> None:
    """A table cannot be rebuilt around a row that breaks its new rule. Failing
    instead would fail during startup, on somebody's real database."""
    db_path = tmp_path / "unchecked.db"
    _alembic(db_path, BEFORE_CHECK_CONSTRAINTS)
    _add_admin(db_path)
    with sqlite3.connect(db_path) as conn:
        conn.executescript(
            """
            INSERT INTO book (id, title, author, format, file_path, pages)
                VALUES (1, 'High', 'a', 'epub', 'high.epub', 0);
            INSERT INTO book (id, title, author, format, file_path, pages)
                VALUES (2, 'Low', 'a', 'epub', 'low.epub', 300);
            INSERT INTO user_book_state (user_id, book_id, rating, progress, updated_at)
                VALUES (7, 1, 9, 3.0, '2026-01-01');
            INSERT INTO user_book_state (user_id, book_id, rating, progress, updated_at)
                VALUES (7, 2, -2, -1.0, '2026-01-01');
            INSERT INTO note (id, user_id, book_id, text, page, created_at)
                VALUES (1, 7, 1, 'x', 0, '2026-01-01');
            INSERT INTO shelf (id, owner_id, name, name_folded, position, visibility, created_at)
                VALUES (1, 7, 'Odd', 'odd', 0, 'secret', '2026-01-01');
            """
        )

    _upgrade(db_path)

    with sqlite3.connect(db_path) as conn:
        states = conn.execute(
            "SELECT book_id, rating, progress FROM user_book_state ORDER BY book_id"
        ).fetchall()
        pages = conn.execute("SELECT id, pages FROM book ORDER BY id").fetchall()
        page = conn.execute("SELECT page FROM note").fetchone()
        visibility = conn.execute("SELECT visibility FROM shelf").fetchone()
    assert states == [(1, 5, 1.0), (2, 0, 0.0)]
    assert pages == [(1, None), (2, 300)]
    assert page == (None,)
    assert visibility == ("private",)
