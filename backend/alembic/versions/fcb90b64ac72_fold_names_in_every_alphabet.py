"""fold names in every alphabet

Revision ID: fcb90b64ac72
Revises: 8be05e88e049
Create Date: 2026-09-07 14:16:02.118472

Tag and shelf names were unique under SQLite's `NOCASE`, which folds the 26
ASCII letters and leaves every other alphabet alone — so "Фантастика" and
"фантастика" were two different tags (#103). Uniqueness moves to a second
column holding the folded form, and `name` goes back to being plain text that
nobody compares.

A collation would have been the smaller change, but SQLite records the
collation's name in the index: a connection that has not registered it cannot
INSERT, UPDATE, DELETE, `ORDER BY name`, `VACUUM`, `REINDEX` or run
`PRAGMA integrity_check`. That is most of what somebody would open their own
library database to do.

An installation may already hold two names that differ only in case. The new
index cannot be built until one of them changes, so this keeps the older name
and suffixes the newer — the same choice `d9731df616b0` made, for the same
reason: failing here would fail during startup, on somebody's real database.

"""

import unicodedata
from collections.abc import Sequence

import sqlalchemy as sa

# Autogenerate renders SQLModel's string columns as
# `sqlmodel.sql.sqltypes.AutoString()` but does not add this import itself,
# so every generated migration would fail with a NameError without it.
import sqlmodel  # noqa: F401

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "fcb90b64ac72"
down_revision: str | Sequence[str] | None = "8be05e88e049"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _fold(name: str) -> str:
    """The fold as it stood at this revision.

    Deliberately not `app.naming.fold_name`, though it is the same rule today.
    A migration is history: if that function later folds differently, replaying
    this revision must still produce what it produced the first time, or a
    fresh database ends up unlike an upgraded one.
    """
    return unicodedata.normalize("NFC", name).casefold()


def _fill_folded(table: str) -> None:
    """Set `name_folded` on every row, renaming whatever would now collide.

    Rows are taken oldest first, so the name somebody chose earliest is the one
    that keeps it. A later clash becomes "<name>-2", then "-3" if that is taken
    too — including by another row this loop has already renamed.
    """
    bind = op.get_bind()
    rows = bind.execute(
        sa.text(f"SELECT id, owner_id, name FROM {table} ORDER BY id")  # noqa: S608
    ).fetchall()

    # Global tags all carry owner_id NULL and share one namespace, which is
    # what `ix_tag_global_name` enforces; grouping by owner covers them and
    # each reader's own rows in the same pass.
    taken: set[tuple[int | None, str]] = set()

    for row in rows:
        name = row.name
        folded = _fold(name)
        suffix = 1
        while (row.owner_id, folded) in taken:
            suffix += 1
            name = f"{row.name}-{suffix}"
            folded = _fold(name)

        taken.add((row.owner_id, folded))
        bind.execute(
            sa.text(f"UPDATE {table} SET name = :name, name_folded = :folded WHERE id = :id"),  # noqa: S608
            {"name": name, "folded": folded, "id": row.id},
        )


def upgrade() -> None:
    """Move uniqueness from the NOCASE collation onto a folded column."""
    # Nullable to begin with: the values do not exist yet, and SQLite cannot
    # add a NOT NULL column without a default nothing here wants.
    op.add_column("shelf", sa.Column("name_folded", sqlmodel.sql.sqltypes.AutoString()))
    op.add_column("tag", sa.Column("name_folded", sqlmodel.sql.sqltypes.AutoString()))

    _fill_folded("shelf")
    _fill_folded("tag")

    # Before the rebuild, so batch mode does not try to carry them across onto
    # a column they no longer name.
    op.drop_index("ix_shelf_owner_name", table_name="shelf")
    op.drop_index("ix_tag_owner_name", table_name="tag")
    op.drop_index("ix_tag_global_name", table_name="tag")

    # SQLite changes neither a column's nullability nor its collation in place,
    # so both tables are rebuilt. `name_folded` must be NOT NULL or the
    # guarantee has a hole straight through it: SQLite counts NULLs as distinct
    # from each other in a unique index.
    for table in ("shelf", "tag"):
        with op.batch_alter_table(table) as batch:
            batch.alter_column(
                "name_folded",
                existing_type=sqlmodel.sql.sqltypes.AutoString(),
                nullable=False,
            )
            batch.alter_column(
                "name",
                existing_type=sa.String(collation="NOCASE"),
                type_=sqlmodel.sql.sqltypes.AutoString(),
                existing_nullable=False,
            )

    op.create_index("ix_shelf_owner_name", "shelf", ["owner_id", "name_folded"], unique=True)
    op.create_index("ix_tag_owner_name", "tag", ["owner_id", "name_folded"], unique=True)
    op.create_index(
        "ix_tag_global_name",
        "tag",
        ["name_folded"],
        unique=True,
        sqlite_where=sa.text("owner_id IS NULL"),
    )


def downgrade() -> None:
    """Put uniqueness back on the NOCASE collation.

    The renames are not undone: "Фантастика-2" may have been "фантастика"
    before, and nothing here records which. Going back only restores the weaker
    rule, under which both names are free to exist again.
    """
    op.drop_index("ix_tag_global_name", table_name="tag")
    op.drop_index("ix_tag_owner_name", table_name="tag")
    op.drop_index("ix_shelf_owner_name", table_name="shelf")

    for table in ("shelf", "tag"):
        with op.batch_alter_table(table) as batch:
            batch.alter_column(
                "name",
                existing_type=sqlmodel.sql.sqltypes.AutoString(),
                type_=sa.String(collation="NOCASE"),
                existing_nullable=False,
            )
        op.drop_column(table, "name_folded")

    op.create_index("ix_shelf_owner_name", "shelf", ["owner_id", "name"], unique=True)
    op.create_index("ix_tag_owner_name", "tag", ["owner_id", "name"], unique=True)
    op.create_index(
        "ix_tag_global_name",
        "tag",
        ["name"],
        unique=True,
        sqlite_where=sa.text("owner_id IS NULL"),
    )
