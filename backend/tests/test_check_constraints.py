"""The rules the database itself refuses to break.

The request models already refuse these values with a 422. The constraints are
for every other writer: a script, a migration, or somebody's SQLite shell.
"""

import pytest
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session

# Parents for the rows below, because foreign keys are enforced too.
PARENT_ROWS = (
    "INSERT INTO user (id, username, password_hash, is_admin, created_at)"
    " VALUES (1, 'reader', 'x', 0, '2026-01-01')",
    "INSERT INTO book (id, title, author, format, file_path)"
    " VALUES (1, 'Dune', 'Frank Herbert', 'epub', 'dune.epub')",
    "INSERT INTO conversation (id, user_id, created_at) VALUES (1, 1, '2026-01-01')",
)

_STATE = (
    "INSERT INTO user_book_state (user_id, book_id, rating, progress, updated_at)"
    " VALUES (1, 1, {rating}, {progress}, '2026-01-01')"
)
_BOOK = (
    "INSERT INTO book (title, author, format, file_path, pages) VALUES ('t', 'a', 'epub', 'f', {})"
)
_NOTE = (
    "INSERT INTO note (user_id, book_id, text, page, created_at)"
    " VALUES (1, 1, 'x', {}, '2026-01-01')"
)
_SHELF = (
    "INSERT INTO shelf (owner_id, name, name_folded, position, visibility, created_at)"
    " VALUES (1, 'x', 'x', 0, '{}', '2026-01-01')"
)
_MESSAGE = (
    "INSERT INTO message (conversation_id, role, content, created_at)"
    " VALUES (1, '{}', 'x', '2026-01-01')"
)

# The name of the constraint, and a row that only that constraint refuses.
REFUSED_ROWS = [
    ("ck_user_book_state_rating", _STATE.format(rating=6, progress=0)),
    ("ck_user_book_state_rating", _STATE.format(rating=-1, progress=0)),
    ("ck_user_book_state_progress", _STATE.format(rating=0, progress=1.5)),
    ("ck_user_book_state_progress", _STATE.format(rating=0, progress=-0.1)),
    ("ck_book_pages", _BOOK.format(0)),
    ("ck_note_page", _NOTE.format(0)),
    ("ck_shelf_visibility", _SHELF.format("secret")),
    ("ck_message_role", _MESSAGE.format("admin")),
]

# The same statements with allowed values, at each end of each range.
ACCEPTED_ROWS = [
    _STATE.format(rating=5, progress=1),
    _BOOK.format(1),
    _BOOK.format("NULL"),
    _NOTE.format(1),
    _NOTE.format("NULL"),
    _SHELF.format("public"),
    _MESSAGE.format("librarian"),
]


@pytest.mark.parametrize(("constraint", "statement"), REFUSED_ROWS)
def test_the_database_refuses_a_value_out_of_range(
    session: Session, constraint: str, statement: str
) -> None:
    connection = session.connection()
    for parent in PARENT_ROWS:
        connection.exec_driver_sql(parent)

    with pytest.raises(IntegrityError, match=f"CHECK constraint failed: {constraint}"):
        connection.exec_driver_sql(statement)


@pytest.mark.parametrize("statement", ACCEPTED_ROWS)
def test_the_database_accepts_the_ends_of_each_range(session: Session, statement: str) -> None:
    connection = session.connection()
    for parent in PARENT_ROWS:
        connection.exec_driver_sql(parent)

    connection.exec_driver_sql(statement)


def test_every_connection_enforces_foreign_keys(session: Session) -> None:
    """SQLite checks them only on a connection that asked, so each one must ask."""
    with pytest.raises(IntegrityError, match="FOREIGN KEY constraint failed"):
        session.connection().exec_driver_sql(
            "INSERT INTO note (user_id, book_id, text, created_at)"
            " VALUES (99, 99, 'x', '2026-01-01')"
        )
