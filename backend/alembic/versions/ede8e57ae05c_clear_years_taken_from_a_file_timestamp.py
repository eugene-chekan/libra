"""clear years taken from a file timestamp

Revision ID: ede8e57ae05c
Revises: fcb90b64ac72
Create Date: 2026-09-14 10:22:39.106815

Data only: the schema does not change. `app.epub` no longer reads a year out
of a `dc:date` that describes the file rather than the work. Standard Ebooks
put the moment they built the ebook there, so every book of theirs already in
the library shows the build year — "The Secret History" by Procopius, written
in the sixth century, shows 2023. This clears those years.

Narrow on purpose, in three ways:

  - Only this one publisher. The parser's other rule compares the date with
    `dcterms:modified`, and that value was never stored, so those rows cannot
    be found here.
  - Only a date with a time of day in it. A plain year in one of these files
    was typed by a person, and the parser keeps it too.
  - Only a year that still matches the date the file gave. A year that does
    not match was corrected by hand, and a migration must not undo that.

The raw date stays in `book_metadata`, so a cleared year is always traceable
to what the file said. The publisher is spelled out here rather than imported
from `app.epub`: this migration describes the rows as they are today, and must
keep doing the same thing even after that list grows.
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
revision: str = "ede8e57ae05c"
down_revision: str | Sequence[str] | None = "fcb90b64ac72"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PUBLISHER = "standard ebooks"


def upgrade() -> None:
    """Blank the year on books whose date was the file's own timestamp."""
    publisher = "json_extract(book_metadata, '$.publisher')"
    published = "json_extract(book_metadata, '$.published')"
    op.execute(
        sa.text(
            "UPDATE book SET year = NULL "
            "WHERE year IS NOT NULL "
            f"AND lower({publisher}) = :publisher "
            # W3C-DTF puts a "T" between the day and the time.
            f"AND instr({published}, 'T') > 0 "
            f"AND CAST(substr({published}, 1, 4) AS INTEGER) = year"
        ).bindparams(publisher=PUBLISHER)
    )


def downgrade() -> None:
    """Nothing to undo.

    Putting the build year back would be restoring the wrong answer, and the
    date it came from is still in `book_metadata` either way. This migration
    changes no schema, so an earlier revision runs against the cleared rows
    fine.
    """
