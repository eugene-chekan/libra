# Database block

The database part of the diploma, for the expert assessment. It describes
the libra database and the librarian's part of it. The requirements are the
department's "Databases" rubric, section **Transactional Databases (OLTP)**.

## Files

| File | What it is |
|---|---|
| [database.md](database.md) | The main text. Start here |
| [data-dictionary.md](data-dictionary.md) | Every table and column |
| [schema.sql](schema.sql) | The DDL script. **Generated, do not edit** |
| [test-data.sql](test-data.sql) | Test rows for every table |
| [dump_schema.py](dump_schema.py) | Writes `schema.sql` from the migrations |

The two diagrams are inside `database.md`, written in Mermaid. Mermaid is a
text format for diagrams. GitHub draws it when it shows the file. VS Code
draws it in the Markdown preview with the "Markdown Preview Mermaid Support"
extension.

## What the text rests on

The text describes the code on `main`, and some plans. When one of these
changes, read the parts of `database.md` that name it.

| Source | What the text takes from it |
|---|---|
| [phase-2-plan.md](../specs/phase-2-plan.md) | Why SQLite and not Chroma, the planned `descriptor` table, and what the panel will show |
| [librarian-panel.md](../specs/librarian-panel.md) | The design of `conversation` and `message` |
| [library-organization.md](../specs/library-organization.md) | The data model of the library, and the permissions |
| Issue #109, open | Finer permissions than reader and admin |
| Issue #110, open | A `setting` table, and why there is one database file |
| The BA block, `docs/ba/ba.md` | That questions sent to the language model are personal data |

Issue #158 was open too. It does not touch the database.

## Keeping it true

**`schema.sql`.** Write it again after any migration is added. From
`backend/`:

```bash
uv run python ../docs/db/dump_schema.py
```

A new run can swap two `FOREIGN KEY` lines of `user_book_state`. That is not
a change of structure: the migration tool does not fix their order.

**After a new migration**, also change in `database.md`: the schema revision
at the top, the history table in "Deployment and versions", and the counts in
"Keys and constraints".

**`test-data.sql`.** It is written by hand. If a migration adds a column that
must have a value, add the column here too. To check the file, load it into
a new database after `schema.sql`. The last line prints every row that breaks
a foreign key, and it must print nothing:

```bash
sqlite3 demo.db < docs/db/schema.sql
```

```bash
sqlite3 demo.db < docs/db/test-data.sql
```

Without the `sqlite3` program, Python does the same. From the repository
root, this makes `demo.db` and prints `[]` when no foreign key is broken:

```bash
python -c "import sqlite3; c = sqlite3.connect('demo.db'); [c.executescript(open(f, encoding='utf-8').read()) for f in ('docs/db/schema.sql', 'docs/db/test-data.sql')]; print(c.execute('PRAGMA foreign_key_check').fetchall())"
```

Git ignores `*.db` files, so `demo.db` is never committed. To look at the
data in libra itself, point libra at that file with
`LIBRA_DATABASE_URL`. The accounts and their test password are in the
comment at the top of `test-data.sql`.

## The requirements, one by one

Checked on 2026-11-14, against the code on `main`. "Yes" means done and
described. "Partly" and "No" are explained, and
each has a number in the list after the table.

### Minimum (for 5 points)

| Requirement | State | Where, or what is missing |
|---|---|---|
| Data dictionary: tables, columns, types, keys, quality | Yes | `data-dictionary.md` |
| How integrity is kept, how transactions work | Yes | `database.md`: Integrity, Transactions |
| ER diagram (optional) | Yes | `database.md`: ER diagram |
| Logical schema, clear, with blocks and colours | Yes | `database.md`: Blocks and relationships |
| DDL script | Yes | `schema.sql` |
| A modern relational DBMS | Yes | SQLite 3. The choice is argued in `database.md`: The DBMS |
| Normalised to 3NF | Yes | Four exceptions, each named with its reason |
| Enough tables, different kinds of relationship | Yes | 13 tables. 1:N, M:N, M:N with data, optional, 1:1 |
| Primary and foreign keys on all tables | Yes | All are declared, and SQLite checks them on every connection libra opens |
| Constraints: NOT NULL, UNIQUE, CHECK | Yes | Six CHECK constraints, four unique indexes and one unique constraint, NOT NULL on every required column |
| Meaningful data types | Yes | `database.md`: Data types |
| Structure made by a script or migrations | Yes | Alembic, run at start-up |
| Scripts and migrations in Git | Yes | `backend/alembic/versions/` |
| Enough test records, with edge cases | Yes | `test-data.sql`, the tests, the 40 experiment books |
| Scripts to fill reference tables | Partly | libra has no reference tables. The global tags in `test-data.sql` are the nearest thing |
| Roles `app_read`, `app_write`, `admin` | Partly | Roles exist in the application (reader, admin). SQLite cannot have database roles (problem 1) |
| The application does not run under superuser | Yes | SQLite has no superuser. The Docker image runs the server as the user `libra` |
| Permissions updated when objects are added | Yes | A test walks every API route and fails if one is open |
| Passwords stored hashed, with no old hash method | Yes | Argon2id |
| Integrity through constraints and transactions | Yes | `database.md`: Integrity, Transactions |
| No plain-text passwords | Yes | |
| No CSV or Excel as the only store | Yes | |
| No loose JSON without a model | Yes | Two JSON columns, both described and argued |
| Integrity is not ignored | Yes | |

### Maximum (for 10 points)

| Requirement | State | Where, or what is missing |
|---|---|---|
| Several DBMS, when the topic needs it, with reasons | Yes | Not needed. The reasons are in `database.md`: Why one DBMS and one layer |
| Data layers, when needed, with reasons | Yes | Not needed. Same section |
| How the structure is versioned | Yes | `database.md`: Deployment and versions |
| Indexes, with reasons | Yes | `database.md`: Indexes |
| Triggers | Yes | Three triggers keep the full-text index correct |
| Stored procedures | No | SQLite has none (problem 4) |
| User-defined functions | Yes | The replaced `lower()`. It is registered by the application, not stored in the database file |
| Views or materialised views | No | None exist (problem 2) |
| Masking of personal data | No | Not done (problem 3) |

## Open problems

Each is also in the last section of `database.md`, so the text an expert
reads is honest about them. When one is fixed, change both places.

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
