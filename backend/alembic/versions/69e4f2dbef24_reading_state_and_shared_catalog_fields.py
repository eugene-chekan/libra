"""reading state and shared catalog fields

Revision ID: 69e4f2dbef24
Revises: d34d899bf315
Create Date: 2026-08-08 21:07:26.353251

Hand-edited after autogenerate in three places, each noted inline: the
foreign key needed a name, and two data backfills cannot be inferred from
the models.
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
revision: str = "69e4f2dbef24"
down_revision: str | Sequence[str] | None = "d34d899bf315"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Named explicitly. Autogenerate emits `create_foreign_key(None, ...)`, and an
# unnamed constraint inside batch mode — which SQLite always uses here — raises
# "Constraint must have a name". The downgrade needs the same name to drop it.
FK_BOOK_UPLOADED_BY = "fk_book_uploaded_by_user"


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "note",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("book_id", sa.Integer(), nullable=False),
        sa.Column("text", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("page", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["book_id"], ["book.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("note", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_note_book_id"), ["book_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_note_user_id"), ["user_id"], unique=False)

    op.create_table(
        "user_book_state",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("book_id", sa.Integer(), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("progress", sa.Float(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("last_sent_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["book_id"], ["book.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        # Composite, not a surrogate id with a unique index. It is what makes
        # the lazy upsert a single primary-key lookup, and in #7 what makes
        # "one shelf per user per book" structural.
        sa.PrimaryKeyConstraint("user_id", "book_id"),
    )

    with op.batch_alter_table("book", schema=None) as batch_op:
        batch_op.add_column(sa.Column("year", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("blurb", sqlmodel.sql.sqltypes.AutoString(), nullable=True))
        batch_op.add_column(sa.Column("pages", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("uploaded_by", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(FK_BOOK_UPLOADED_BY, "user", ["uploaded_by"], ["id"])

    # --- backfills, none of which autogenerate can infer -------------------

    # `description` becomes a column, so move the existing values across and
    # remove the key. Keeping both would let an admin edit `blurb` and leave a
    # stale contradicting copy in the JSON for a later reader to prefer.
    op.execute(
        "UPDATE book SET blurb = json_extract(book_metadata, '$.description') "
        "WHERE blurb IS NULL AND json_extract(book_metadata, '$.description') IS NOT NULL"
    )
    op.execute(
        "UPDATE book SET book_metadata = json_remove(book_metadata, '$.description') "
        "WHERE json_extract(book_metadata, '$.description') IS NOT NULL"
    )

    # `year` from the raw date already in the blob. Deliberately narrower than
    # app.epub._parse_year: this handles the leading-ISO-year case only, and
    # copying the full rule here would freeze a duplicate of application logic
    # that is free to change. Anything this misses stays NULL, which is the
    # project's standing answer for "the file did not say" — a blank year is
    # correctable, a wrong one is not detectable.
    #   - the five-digit exclusion rejects "20110101", a malformed date rather
    #     than the year 2011
    #   - the lower bound rejects Calibre's "0101-01-01" unknown-date sentinel
    raw_date = "json_extract(book_metadata, '$.published')"
    leading_year = f"CAST(substr({raw_date}, 1, 4) AS INTEGER)"
    op.execute(
        f"UPDATE book SET year = {leading_year} "
        f"WHERE year IS NULL "
        f"AND {raw_date} GLOB '[0-9][0-9][0-9][0-9]*' "
        f"AND {raw_date} NOT GLOB '[0-9][0-9][0-9][0-9][0-9]*' "
        f"AND {leading_year} BETWEEN 1450 AND 2100"
    )

    # Attribute existing books to the bootstrap admin. Degrades to a no-op when
    # no admin exists — `app.cli.create_admin` runs migrations *before* it
    # creates the user, and anyone who upgraded through #4 without running it
    # is in exactly that state. `uploaded_by` is provenance and nullable by
    # design, so an unattributed book is a valid row; raising here would break
    # startup for anyone mid-upgrade. One-shot: books added before an admin
    # exists stay NULL. This must never *create* a user — an ebook server that
    # mints its own admin is the hole the CLI bootstrap exists to close.
    op.execute(
        "UPDATE book SET uploaded_by = (SELECT MIN(id) FROM user WHERE is_admin = 1) "
        "WHERE uploaded_by IS NULL AND EXISTS (SELECT 1 FROM user WHERE is_admin = 1)"
    )


def downgrade() -> None:
    """Downgrade schema.

    The backfills are not reversed: `blurb` values came from the blob and the
    column is about to be dropped, and re-inserting a `description` key would
    guess at which rows had one originally.
    """
    with op.batch_alter_table("book", schema=None) as batch_op:
        batch_op.drop_constraint(FK_BOOK_UPLOADED_BY, type_="foreignkey")
        batch_op.drop_column("uploaded_by")
        batch_op.drop_column("pages")
        batch_op.drop_column("blurb")
        batch_op.drop_column("year")

    op.drop_table("user_book_state")
    with op.batch_alter_table("note", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_note_user_id"))
        batch_op.drop_index(batch_op.f("ix_note_book_id"))

    op.drop_table("note")
