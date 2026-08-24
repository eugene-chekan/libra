"""tag names without spaces

Revision ID: d9731df616b0
Revises: 9a8d5d47149e
Create Date: 2026-08-24 21:34:11.546534

Data only: the schema does not change. `POST /tags` and `PATCH /tags/{id}`
now refuse a name with whitespace in it, because the search box reads `#tag`
tokens and splits on whitespace — a tag named "lent out" could be created but
never searched for. Names already stored still work everywhere except that
search box, so this rewrites them: each run of whitespace becomes one hyphen.

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
revision: str = "d9731df616b0"
down_revision: str | Sequence[str] | None = "9a8d5d47149e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Rewrite the tag names that contain whitespace."""
    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id, owner_id, name FROM tag")).fetchall()

    # The unique indexes on this table are NOCASE, and one of them covers
    # global tags as a group, so a clash has to be found the same way: case
    # folded, and scoped by owner. Without this, hyphenating one name onto
    # another that already exists would fail the migration halfway through —
    # on somebody's real database, during startup.
    taken = {(row.owner_id, row.name.casefold()) for row in rows}

    for row in rows:
        if not any(char.isspace() for char in row.name):
            continue

        base = "-".join(row.name.split())
        candidate = base
        suffix = 1
        while (row.owner_id, candidate.casefold()) in taken:
            suffix += 1
            candidate = f"{base}-{suffix}"

        taken.discard((row.owner_id, row.name.casefold()))
        taken.add((row.owner_id, candidate.casefold()))
        bind.execute(
            sa.text("UPDATE tag SET name = :name WHERE id = :id"),
            {"name": candidate, "id": row.id},
        )


def downgrade() -> None:
    """Nothing to undo.

    The old names cannot be recovered: "lent-out" may have been "lent out" or
    "lent-out" before, and this migration does not record which. It changes no
    schema, so an earlier revision runs against the rewritten names fine.
    """
