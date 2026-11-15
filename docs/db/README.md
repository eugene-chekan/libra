# Database block

The database part of the diploma, for the expert assessment, in English, as
one DOCX of about 20 pages. It describes the Libra database and the
Librarian's part of it. The requirements are the department's "Databases"
rubric, section **Transactional Databases (OLTP)**. It has the same form as
the BA block in `docs/ba/`.

## Files

| File | What it is |
|---|---|
| `database.md` | The text. Edit this, not the DOCX |
| `references.md` | The sources, one `@key: entry` line each, in IEEE style |
| `diagrams/schema.py` | Draws the two diagrams as SVG |
| `diagrams/*.svg`, `diagrams/*.png` | The drawn diagrams. The build puts each PNG where `database.md` names it |
| [data-dictionary.md](data-dictionary.md) | Every table and column, in full. Appendix A of the text is its short form |
| [schema.sql](schema.sql) | The DDL script. **Generated, do not edit** |
| [test-data.sql](test-data.sql) | Test rows for every table |
| [dump_schema.py](dump_schema.py) | Writes `schema.sql` from the migrations |
| [run-for-the-expert.md](run-for-the-expert.md) | How the expert can look at the database |

## Build

From the repository root:

```bash
uv run --no-project --with python-docx python docs/build_docx.py docs/db/database.md
```

The result is `docs/db/out/DB_Chekan_Yauheni.docx` (the `file:` line at the
top of `database.md`). Git ignores the `out` folder. Open the result in Word
and answer **Yes** when it asks to update fields. That fills in the table of
contents and its page numbers.

`docs/build_docx.py` is shared with the BA block. What it understands in a
source file is listed in [docs/ba/README.md](../ba/README.md). One thing is
used only here: a block between two lines of three backticks is written as
code, in a small fixed-width font.

Keep the text at about 20 pages. On 2026-11-15 it was 21 pages.

The expert also gets two PDF files: `data-dictionary.pdf` and
`run-for-the-expert.pdf`. The DOCX names the first one. They were made from
the two `.md` files by hand, with no script in the project, and they are in
the `out` folder too. Make them again when a `.md` file changes.

## Diagrams

Both diagrams come from one script. The tables and their columns are in
`TABLES` at the top of the script, typed by hand from `schema.sql`. The drawn
`.png` files are committed, so the build works without ImageMagick. Draw them
again after a migration changes a table:

```bash
python docs/db/diagrams/schema.py
```

```bash
magick -density 150 docs/db/diagrams/blocks.svg docs/db/diagrams/blocks.png
```

```bash
magick -density 150 docs/db/diagrams/er.svg docs/db/diagrams/er.png
```

- `blocks.png` is the logical schema: the tables in their five blocks
  (Figure 1, Section 1.2).
- `er.png` is the ER diagram: every table with its columns and keys
  (Appendix B).

## What the text rests on

The text describes the code on `main`, and some plans. When one of these
changes, read the parts of `database.md` that name it.

| Source | What the text takes from it |
|---|---|
| [phase-2-plan.md](../specs/phase-2-plan.md) | Why SQLite and not Chroma, the planned `descriptor` table, and what the panel will show |
| [librarian-panel.md](../specs/librarian-panel.md) | The design of `conversation` and `message` |
| [library-organization.md](../specs/library-organization.md) | The data model of the library, and the permissions |
| Issue #109, open | Finer permissions than reader and admin |
| Issue #110, open | Why there is one database file |
| The BA block, `docs/ba/ba.md` | That questions sent to the language model are personal data |

## Keeping it true

**`schema.sql`.** Write it again after any migration is added. From
`backend/`:

```bash
uv run python ../docs/db/dump_schema.py
```

A new run can swap two `FOREIGN KEY` lines of `user_book_state`. That is not
a change of structure: the migration tool does not fix their order.

**After a new migration**, also change:

- in `database.md`: the revision in Table 1, the history table in Section
  2.5, the counts in Section 1.5, and Appendix A;
- `data-dictionary.md`;
- `TABLES` in `diagrams/schema.py`, and then draw the diagrams again.

**`test-data.sql`.** It is written by hand. If a migration adds a column that
must have a value, add the column here too. To check the file, load it into
a new database after `schema.sql`:

```bash
sqlite3 demo.db < docs/db/schema.sql
```

```bash
sqlite3 demo.db < docs/db/test-data.sql
```

The last line of `test-data.sql` prints every row that breaks a foreign key,
and it must print nothing. Without the `sqlite3` program, Python does the
same. From the repository root, this makes `demo.db` and prints `[]` when no
foreign key is broken:

```bash
python -c "import sqlite3; c = sqlite3.connect('demo.db'); [c.executescript(open(f, encoding='utf-8').read()) for f in ('docs/db/schema.sql', 'docs/db/test-data.sql')]; print(c.execute('PRAGMA foreign_key_check').fetchall())"
```

Git ignores `*.db` files, so `demo.db` is never committed. To look at the
data in Libra itself, point Libra at that file with `LIBRA_DATABASE_URL`. The
accounts and their test password are in the comment at the top of
`test-data.sql`.

## The requirements, one by one

Checked on 2026-11-14, against the code on `main`. "Yes" means done and
described. "Partly" and "No" are explained, and each has a number in the list
after the table. The "Where" column names a section of `database.md`.

### Minimum (for 5 points)

| Requirement | State | Where, or what is missing |
|---|---|---|
| Data dictionary: tables, columns, types, keys, quality | Yes | Appendix A, and `data-dictionary.md` |
| How integrity is kept, how transactions work | Yes | Sections 2.1, 2.2 |
| ER diagram (optional) | Yes | Appendix B |
| Logical schema, clear, with blocks and colours | Yes | Section 1.2, Figure 1 |
| DDL script | Yes | `schema.sql` |
| A modern relational DBMS | Yes | SQLite 3. The choice is argued in Section 1.1 |
| Normalised to 3NF | Yes | Section 1.4. Four exceptions, each named with its reason |
| Enough tables, different kinds of relationship | Yes | Section 1.3. 13 tables. 1:N, M:N, M:N with data, optional, 1:1 |
| Primary and foreign keys on all tables | Yes | Section 1.5. SQLite checks them on every connection Libra opens |
| Constraints: NOT NULL, UNIQUE, CHECK | Yes | Section 1.5. Six CHECK constraints, four unique indexes and one unique constraint |
| Meaningful data types | Yes | Section 1.5 |
| Structure made by a script or migrations | Yes | Section 2.5. Alembic, run at start-up |
| Scripts and migrations in Git | Yes | `backend/alembic/versions/` |
| Enough test records, with edge cases | Yes | Section 2.6. `test-data.sql`, the tests, the 40 experiment books |
| Scripts to fill reference tables | Partly | Libra has no reference tables. The global tags in `test-data.sql` are the nearest thing |
| Roles `app_read`, `app_write`, `admin` | Partly | Section 2.7. Roles exist in the application. SQLite cannot have database roles (problem 1) |
| The application does not run under superuser | Yes | SQLite has no superuser. The Docker image runs the server as the user `libra` |
| Permissions updated when objects are added | Yes | A test walks every API route and fails if one is open |
| Passwords stored hashed, with no old hash method | Yes | Section 2.8. Argon2id |
| Integrity through constraints and transactions | Yes | Sections 2.1, 2.2 |
| No plain-text passwords | Yes | |
| No CSV or Excel as the only store | Yes | |
| No loose JSON without a model | Yes | Section 1.6. Two JSON columns, both described and argued |
| Integrity is not ignored | Yes | |

### Maximum (for 10 points)

| Requirement | State | Where, or what is missing |
|---|---|---|
| Several DBMS, when the topic needs it, with reasons | Yes | Not needed. The reasons are in Section 1.1, Table 2 |
| Data layers, when needed, with reasons | Yes | Not needed. Same table |
| How the structure is versioned | Yes | Section 2.5 |
| Indexes, with reasons | Yes | Section 2.3 |
| Triggers | Yes | Section 2.4. Three triggers keep the full-text index correct |
| Stored procedures | No | SQLite has none (problem 4) |
| User-defined functions | Yes | Section 2.4. The replaced `lower()` |
| Views or materialised views | No | None exist (problem 2) |
| Masking of personal data | No | Not done (problem 3) |

## Open problems

Each is also in Section 2.10 of `database.md`, so the text an expert reads is
honest about them. When one is fixed, change both places.

1. **No database roles.** SQLite cannot have them. *Possible:* open a
   read-only connection (`mode=ro`) for code that only reads, and describe it
   as the read role.
2. **No views.** *Possible:* a view for a real need, for example the
   maintenance page's counts, or each book with its number of readers.
3. **No masking of personal data.** *Possible:* a view over `user` that masks
   `kindle_email`, and a masked user name in the failed sign-in log line.
4. **No stored procedures.** SQLite has none. Nothing to fix. The text says
   so.

Problems 2 and 3 are the two "maximum" requirements that are fully missing
today.

## Fixed while this block was written

| Problem | Fixed in |
|---|---|
| Foreign keys were declared but not enforced | #166 |
| There were no `CHECK` constraints | #166 |
| Deleting a user left their librarian conversation, and a new user could inherit it | #166 |
| The Docker image ran the server as `root` | #167 |
