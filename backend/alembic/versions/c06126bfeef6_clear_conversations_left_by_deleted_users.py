"""clear conversations left by deleted users

Revision ID: c06126bfeef6
Revises: ede8e57ae05c
Create Date: 2026-11-14 16:49:05.342507

Data only: the schema does not change. Deleting a user used to leave their
conversation with the librarian behind. SQLite gives the id of a deleted row
to the next new row, so the next account made could open that conversation
and read it. `delete_user` now removes it. This clears what is already there.

Two kinds of conversation go:

  - One whose user no longer exists.
  - One that is older than the account it belongs to. A conversation is made
    the first time its reader opens the panel, so it can never be older than
    the reader. An older one was inherited from a deleted account.

A user made and deleted in the same moment as the next one is beyond this
test. Nothing stored tells those two apart.
"""

from collections.abc import Sequence

import sqlalchemy as sa

# Autogenerate renders SQLModel's string columns as
# `sqlmodel.sql.sqltypes.AutoString()` but does not add this import itself,
# so every generated migration would fail with a NameError without it.
# Unused in migrations that touch no string column; hence the noqa.
import sqlmodel  # noqa: F401

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c06126bfeef6"
down_revision: str | Sequence[str] | None = "ede8e57ae05c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# A conversation that belongs to nobody, or to somebody who came after it.
_STRAY = (
    "SELECT conversation.id FROM conversation "
    "LEFT JOIN user ON user.id = conversation.user_id "
    "WHERE user.id IS NULL OR conversation.created_at < user.created_at"
)


def upgrade() -> None:
    """Delete the stray conversations and every message with no conversation."""
    op.execute(sa.text(f"DELETE FROM message WHERE conversation_id IN ({_STRAY})"))  # noqa: S608
    op.execute(sa.text(f"DELETE FROM conversation WHERE id IN ({_STRAY})"))  # noqa: S608
    op.execute(
        sa.text("DELETE FROM message WHERE conversation_id NOT IN (SELECT id FROM conversation)")
    )


def downgrade() -> None:
    """Nothing to undo.

    The deleted rows were another person's private questions. This migration
    changes no schema, so an earlier revision runs without them fine.
    """
