"""check constraints

Revision ID: 58dc777b7e31
Revises: c06126bfeef6
Create Date: 2026-11-14 16:49:06.311538

The request models already refuse a rating of 6 or a shelf that is neither
private nor public. Nothing stopped any other writer: a script, a later
migration, or somebody's SQLite shell. These constraints do.

A row that breaks a rule would stop the table from being rebuilt, and so stop
the server from starting. No such row should exist, because every writer so far
went through the request models. The repairs below are for a database somebody
edited by hand. Each one moves a value the shortest way into its range:

  - a rating or a progress goes to the nearest end of its range;
  - a page count or a page number below 1 becomes empty, which means "unknown";
  - an unknown visibility becomes private, the choice that shows nothing.

`message.role` is not repaired. The server writes it from two fixed words and
never from a request, and no other value has a sensible replacement.

The values are written out here, not imported from `app.models`: a migration is
a record of what was run, and must not change when the models do.
"""

from collections.abc import Sequence

# Autogenerate renders SQLModel's string columns as
# `sqlmodel.sql.sqltypes.AutoString()` but does not add this import itself,
# so every generated migration would fail with a NameError without it.
# Unused in migrations that touch no string column; hence the noqa.
import sqlmodel  # noqa: F401

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "58dc777b7e31"
down_revision: str | Sequence[str] | None = "c06126bfeef6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Table, constraint name, condition.
CHECKS = (
    ("book", "ck_book_pages", "pages >= 1"),
    ("note", "ck_note_page", "page >= 1"),
    ("shelf", "ck_shelf_visibility", "visibility IN ('private', 'public')"),
    ("message", "ck_message_role", "role IN ('user', 'librarian')"),
    ("user_book_state", "ck_user_book_state_rating", "rating BETWEEN 0 AND 5"),
    ("user_book_state", "ck_user_book_state_progress", "progress BETWEEN 0 AND 1"),
)

REPAIRS = (
    "UPDATE user_book_state SET rating = min(max(rating, 0), 5) WHERE rating NOT BETWEEN 0 AND 5",
    "UPDATE user_book_state SET progress = min(max(progress, 0), 1) "
    "WHERE progress NOT BETWEEN 0 AND 1",
    "UPDATE book SET pages = NULL WHERE pages < 1",
    "UPDATE note SET page = NULL WHERE page < 1",
    "UPDATE shelf SET visibility = 'private' WHERE visibility NOT IN ('private', 'public')",
)


def _tables() -> list[str]:
    """Each table once, in the order CHECKS first names it."""
    return list(dict.fromkeys(table for table, _, _ in CHECKS))


def upgrade() -> None:
    """Repair what would break a rule, then add the rules."""
    for statement in REPAIRS:
        op.execute(statement)

    for table in _tables():
        with op.batch_alter_table(table) as batch:
            for owner, name, condition in CHECKS:
                if owner == table:
                    batch.create_check_constraint(name, condition)


def downgrade() -> None:
    """Remove the rules. The repaired values stay: the old ones were not valid."""
    for table in _tables():
        with op.batch_alter_table(table) as batch:
            for owner, name, _ in CHECKS:
                if owner == table:
                    batch.drop_constraint(name, type_="check")
