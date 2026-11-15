---
title: A Passage Retrieval System for an E-book Library Using LLM-Generated Semantic Descriptors
subtitle: Database Block — Design and Implementation of the Database
author: Chekan Yauheni
supervisor: Assoc. Prof. Audeychik Sergei, Candidate of Technical Sciences (PhD)
programme: Informatics
type: Individual project
place: Vilnius, 2026
file: DB_Chekan_Yauheni.docx
---

[[TOC]]

# Introduction

## Purpose of the database

**Libra** is a self-hosted e-book library. One household runs it on its own
computer, and a few people share one set of books. Each person has their own
shelves, ratings, reading progress and notes. The **Librarian** is a panel
where a reader asks a question, and the system finds the passages of the
books that answer it.

The database has four tasks:

1. Keep the shared catalogue: one row for one book file.
2. Keep each reader's own data separate from every other reader's data.
3. Keep accounts and sessions, so that a person can sign in.
4. Keep the Librarian's conversations and the search index of the book text.

The book files (EPUB) are not in the database. They are in a folder next to
it, and the database stores the name of each file.

## Scope of this document

The database is assessed as a **transactional database (OLTP)**. It is the
main store of the application. Libra uses no NoSQL database, so that part of
the requirements does not apply.

[[TABLE: The database in short]]

| Property | Value |
|---|---|
| Kind of database | Relational, transactional (OLTP) |
| DBMS | SQLite 3 (version 3.50.4 on the development computer) |
| Access from code | SQLModel: SQLAlchemy and Pydantic [@sqlmodel] |
| Structure is created by | 13 Alembic migrations, stored in Git [@alembic] |
| Tables | 13, in five blocks |
| Checked against the code | 14 November 2026, branch `main`, revision `a6a7fa951ca6` |

Chapter 1 describes the design, and Chapter 2 describes how the database
works. Appendix A is the data dictionary, and Appendix B is the ER diagram.
Three files are too long for this document. The long data dictionary is sent
with it as `data-dictionary.pdf`. The full DDL script, `schema.sql`, and the
test rows for every table, `test-data.sql`, are in the folder `docs/db` of
the project repository [@librarepo].

# Chapter 1. Database design

## 1.1 Choice of the DBMS

Libra uses **SQLite 3**. SQLite is a relational DBMS with full SQL, ACID
transactions, foreign keys, unique and partial indexes, triggers, JSON
functions and a full-text search engine (FTS5). Libra uses all of them.

**Why SQLite fits this project** [@sqliteuse]:

- Libra runs on one home computer, with one server process and a few users.
  No task needs several servers that write at the same time.
- A person installs Libra with one command. SQLite needs no second service,
  no network port, no database password and no administrator.
- The whole database is one file. A backup is a copy of this file and of the
  book folder.
- Search needs BM25 ranking [@robertson2009]. SQLite has it built in (FTS5),
  in the same database and the same transaction as the books.

**What SQLite cannot do.** It has no user accounts and no `GRANT`, so
database roles cannot be created (Section 2.7). It has no stored procedures.
Only one transaction can write at a time, which is enough for a household.

The requirements suggest several DBMS and several data layers "when needed".
In Libra they are not needed. Table 2 gives the reasons.

[[TABLE: Alternatives considered]]

| Alternative and decision | Reason |
|---|---|
| A vector database (Chroma) for search, next to SQLite. **Rejected** | With two stores, the second delete can fail and leave passages of a deleted book. BM25 would need one more library. A vector database gives approximate results, and the experiment needs exact ones |
| A second SQLite file for application state. **Rejected** | Every table links to `user` or `book`. SQLite cannot check a foreign key between two files, or write both in one transaction |
| Raw, staging and data-mart layers. **Not needed** | These layers are for analytics. Libra's data is typed by users or read from a book file, and it is used in the form in which it is stored |
| Everything in one SQLite database. **Chosen** | One transaction deletes a book and its search data. Vector search is exact: all 9,476 chunks of the 40 test books are scored in memory. The limit is size: about 500 books give one million vectors, and then a vector index is needed. The tables stay the same |

## 1.2 Logical schema

The 13 tables form five blocks (Figure 1): accounts, the shared catalogue,
one reader's own rows, the Librarian's chat, and the Librarian's search
index. The colours are the same in the ER diagram in Appendix B.

[[FIGURE: blocks.png | Logical schema: the tables in five blocks | 8.5]]

**The main design decision** is the border between shared data and one
reader's data. The title of a book is the same for everybody, so it is in
`book`. A rating belongs to one reader, so it is in `user_book_state`. Two
readers who rate the same book write two different rows, and one can never
overwrite the other.

## 1.3 Relationships

The schema has 16 relationships of five kinds.

[[TABLE: Kinds of relationship]]

| Kind | Example | How it is built |
|---|---|---|
| One to many | A user has many shelves, notes and sessions. A book has many chunks | A foreign key on the "many" side |
| Many to many | A book has many tags, and a tag is on many books | The link table `book_tag`. Its primary key is both columns |
| Many to many, with data | A reader reads many books, and a book has many readers | `user_book_state` with the primary key `(user_id, book_id)`. The rating, the progress and the shelf are in this row |
| Optional | A book may have no known uploader. A tag may have no owner (a global tag). A book may be on no shelf | A foreign key column that may be empty |
| One to one | A chunk has one entry in the full-text index | `chunk_fts.rowid` equals `chunk.id`. Three triggers keep them equal |

## 1.4 Normalisation

The schema is in third normal form [@codd1970], with four exceptions.

**First normal form.** Every column holds one value. A list is never stored
in a text column: the tags of a book are rows in `book_tag`. The two JSON
columns are the exception (Section 1.6).

**Second normal form.** Three tables have a primary key of two columns:
`user_book_state`, `book_tag` and `chunk_vector`. In each of them, every
other column depends on the whole key. For example, a rating is about one
reader *and* one book.

**Third normal form.** No column depends on a column that is not a key.
Facts about a user are only in `user`. Other tables store `user_id` and
never the user's name.

[[TABLE: Exceptions to the normal forms]]

| Column and table | What breaks the rule | Why it stays | What keeps it correct |
|---|---|---|---|
| name_folded in shelf and in tag | It is calculated from `name` | The unique index needs a form of the name without upper and lower case, in every alphabet. SQLite's own rule knows only the 26 ASCII letters | Code sets it from `name` before every insert and update. No other code writes it |
| author in book | Several authors are joined into one text | It is the text that the screen shows. Nothing searches by a single author | The full list is in `book_metadata` |
| The book title inside meta in message | It repeats `book.title` | It records what the Librarian said at that time. A later change of the title must not change an old reply | It is written once and never updated |
| word_count and token_count in chunk | They are calculated from `chunk.text` | Counting tokens needs the embedding model, and the experiment reads these numbers often | A chunk never changes after it is written |

## 1.5 Keys, constraints and data types

[[TABLE: Keys and constraints]]

| Kind | Number | Notes |
|---|---|---|
| Primary keys | 13, one in every table | One number in most tables. Two columns in `user_book_state`, `book_tag` and `chunk_vector`. A hash in `user_session` |
| Foreign keys | 15 | Every link between tables is declared. SQLite checks each one on every write |
| NOT NULL columns | Every required column | A column may be empty only where "unknown" or "none" is a real answer |
| UNIQUE rules | 4 unique indexes, 1 unique constraint | The user name; a shelf name of one owner; a tag name of one owner; a global tag name; the position of a chunk in a book |
| CHECK constraints | 6 | A rating is 0 to 5. A progress is 0 to 1. A page count and a page number are 1 or more. A shelf is `private` or `public`. A message is from `user` or `librarian` |

[[TABLE: Data types]]

| Data | Type in the DDL script | Reason |
|---|---|---|
| Identifiers, counts, years, positions | INTEGER | Whole numbers |
| Reading progress | FLOAT | A share from 0 to 1 |
| Names and text | VARCHAR | Text of any length |
| Yes or no | BOOLEAN | Stored as 0 or 1 |
| Moments in time | DATETIME | Always UTC. A time is never stored as free text |
| Extra facts with a described form | JSON | Section 1.6 |
| Embedding vectors | BLOB | 32-bit floats as bytes: 3,072 bytes for one vector. The same vector as JSON text takes about 15,000 bytes |

## 1.6 The two JSON columns

Libra has two JSON columns. Each has a described form and a reason, so the
database does not become a store of free documents.

**`book.book_metadata`.** An EPUB file contains many facts: language,
publisher, identifiers, subjects. Libra does not show them, filter by them or
link by them. They are kept so that nothing from the file is lost. Every fact
that the application uses is a real column: `title`, `author`, `year`,
`blurb`, `pages`. When a fact starts to be used, a migration moves it to a
column. This happened once: revision 3 moved the description and the year
out of the JSON.

**`message.meta`.** It records what the Librarian did to produce a reply: the
search step and the book that the reply names. The form will grow when the
Librarian becomes an agent with several tools. A JSON column allows this
without a new migration for every tool.

One piece of code writes each column, so the form cannot change by accident.

## 1.7 Chapter conclusions

The design gives one SQLite database with 13 tables in five blocks and 16
relationships of five kinds. The schema is in third normal form, with four
exceptions that each have a reason and a guard. Several DBMS and several data
layers were considered and rejected, with reasons.

# Chapter 2. Implementation and operation

## 2.1 Data integrity

Integrity is kept at three levels.

**Level 1: the database.** SQLite checks primary keys, foreign keys, unique
indexes, `NOT NULL` and `CHECK` on every write.

- **Foreign keys.** A row cannot point at a row that does not exist. A row
  cannot be deleted while other rows point at it. SQLite checks foreign keys
  only when a connection asks for it [@sqlitefk], so Libra sets
  `PRAGMA foreign_keys = ON` on every connection that it opens. Nothing
  cascades: the application deletes the child rows itself, and the database
  refuses the delete if one is left.
- **Structure as a rule.** `user_book_state` has one row for one reader and
  one book, and this row has one `shelf_id`. So a book is on one shelf of a
  reader at most, and no code has to check this.
- **A partial unique index.** SQL treats two empty values as different. So
  the index on `(owner_id, name_folded)` alone would allow two global tags
  with the same name. The index `ix_tag_global_name` closes this gap.

**Level 2: the application.** The rules for books, shelves, tags, reading
state and notes are in one module, `app/library.py`. Both the HTTP layer and
the command line call it, so each rule exists in one place.

- A parent row is found before a child row is written.
- Child rows are deleted before their parent, in one transaction. This is
  important in SQLite: it can give the number of a deleted row to the next
  new row, so a forgotten child row would pass to a new book or a new user.
- Some rules cannot be written as a foreign key. A `shelf_id` must name a
  shelf of the same reader. A personal tag cannot have the name of a global
  tag. A reader can read and write only their own rows.
- The request models check the same value ranges as the `CHECK` constraints.
  A wrong value gets a clear error before the database is touched. The
  constraints protect against every other writer, such as a script.

**Level 3: the tests.** The backend has 567 test functions, which run as 704
cases, before every push and in CI. Four groups guard the database:

- `test_models_and_migrations_agree` fails when a table in the code is
  different from the table that the migrations build.
- `test_every_route_requires_authentication` fails when a route of the API
  works without a sign-in.
- The tests of `delete_book` and `delete_user` check that no row of a deleted
  book or user is left.
- `tests/test_check_constraints.py` writes a row that breaks each `CHECK`
  constraint, and a row without a parent. Each one must be refused.

## 2.2 Transactions

Each request gets its own database session. A function in `app/library.py`
makes all its changes and calls `commit()` at the end. If something fails
before that, nothing is written. SQLite transactions are ACID, and only one
transaction writes at a time.

[[TABLE: Operations that change several rows in one transaction]]

| Operation | What changes together |
|---|---|
| Delete a book | The book, its tag links, every reader's state for it, its notes, and its search chunks and vectors |
| Delete a user | The user, their sessions, shelves, tags, tag links, state rows, notes, and their conversation with its messages. Their uploaded books stay, with `uploaded_by` made empty |
| Delete a shelf | Its books move to another shelf of the same reader, or to no shelf. Then the shelf is deleted |
| Reorder shelves | The position of every shelf of the reader |
| Set the tags of a book | The old links are removed and the new links are added |
| Index a book for search | All its chunks and all their vectors |

**Files and rows.** A book is a row and a file, and a file system has no
transactions. The order of the steps makes every failure safe. At upload, the
file is saved first and the row is inserted last; if the insert fails, the
file is deleted. At delete, the rows are committed first and the file is
removed last. A failure can leave a file without a row, but never a row
without a file. The administrator's maintenance page lists such leftovers.

## 2.3 Indexes

[[TABLE: Indexes]]

| Index and its columns | Query that needs it |
|---|---|
| ix_user_username (unique): user (username) | Every sign-in finds a user by name |
| Primary key: user_session (token_hash) | Every request with a cookie finds the session by the hash of the token |
| ix_user_session_user_id: user_session (user_id) | Deleting a user removes their sessions |
| Primary key: user_book_state (user_id, book_id) | Saving reading progress is one search by key. Listing a reader's books uses the first column |
| ix_note_user_id, ix_note_book_id: note | The book page lists one reader's notes on one book |
| ix_shelf_owner_name (unique): shelf (owner_id, name_folded) | A shelf name is unique for its owner. Also lists the shelves of an owner |
| ix_tag_owner_name (unique): tag (owner_id, name_folded) | The same, for personal tags |
| ix_tag_global_name (unique, partial): tag (name_folded) WHERE owner_id IS NULL | A global tag name is unique |
| ix_conversation_user_id: conversation (user_id) | Opening the panel finds the reader's conversation |
| ix_message_conversation_id: message (conversation_id) | Loading a conversation reads its messages |
| ix_chunk_book_id: chunk (book_id) | Deleting or indexing a book finds its chunks |
| uq_chunk_book_version_position (unique): chunk (book_id, chunker_version, position) | A book cannot be indexed twice |
| chunk_fts: full-text index on chunk.text | Word search with BM25 ranking |

Two more indexes, `ix_shelf_owner_id` and `ix_tag_owner_id`, repeat the first
column of the unique indexes above and can be removed. The catalogue search
has no index on purpose: it looks for a piece of text anywhere inside `title`
or `author`, a normal index cannot help with that, and a home library has a
few thousand rows at most.

## 2.4 Triggers, functions and views

**Triggers.** Three triggers on `chunk` keep the full-text index correct
[@sqlitefts5]: `chunk_ai` after an insert, `chunk_ad` after a delete and
`chunk_au` after an update. Code that writes a chunk does not have to
remember the index, and the index changes in the same transaction as the row.

```sql
CREATE VIRTUAL TABLE chunk_fts USING fts5(
    text, content='chunk', content_rowid='id', tokenize='porter unicode61'
);
CREATE TRIGGER chunk_ai AFTER INSERT ON chunk BEGIN
    INSERT INTO chunk_fts(rowid, text) VALUES (new.id, new.text);
END;
```

**A user-defined function.** SQLite's `lower()` changes only the 26 ASCII
letters [@sqlitefunc], so a search for "долгая" did not find "Долгая". Libra
replaces `lower()` with its own function, which works in every alphabet. The
function is registered on every connection in `app/db.py`. It is part of the
application, not of the database file: another program that opens the file
gets SQLite's own `lower()`.

**Stored procedures and views.** SQLite has no stored procedures; the logic
that would be a procedure in PostgreSQL is in `app/library.py`. There are no
views today: what the application shows about a book depends on the person
who asks, and `app/library.py` joins this data.

## 2.5 Migrations and versions

**Nothing is created by hand.** Alembic migrations in
`backend/alembic/versions/` create the structure [@alembic]. Each migration
is a Python file with an `upgrade` step and a `downgrade` step. The
application runs the missing migrations at every start, so an installation
updates itself.

**How a change is made.** The table class in `backend/app/models.py` is
changed, Alembic writes the migration, and the author adds the steps that
move existing data. The class and the migration are committed together. The
test `test_models_and_migrations_agree` fails if the migration is missing.
The database stores its revision in the table `alembic_version`, and the
files are in Git, so every change has an author, a date and a reason.

[[TABLE: History of the schema]]

| # | Alembic revision | Date (year-month-day) | What it does |
|---|---|---|---|
| 1 | 45e89aabeb7c | 2026-08-03 | The first table: `book` |
| 2 | d34d899bf315 | 2026-08-04 | `user`, `user_session` |
| 3 | 69e4f2dbef24 | 2026-08-08 | `note`, `user_book_state`; four new columns in `book`. Moves the description and the year out of the JSON |
| 4 | afb8fd54343f | 2026-08-08 | `shelf`; `user_book_state.shelf_id` |
| 5 | 9a8d5d47149e | 2026-08-08 | `tag`, `book_tag` |
| 6 | d9731df616b0 | 2026-08-24 | Data only: spaces in tag names become hyphens |
| 7 | 12214bf85cad | 2026-08-28 | `conversation`, `message` |
| 8 | 8be05e88e049 | 2026-09-03 | `user_book_state.position` |
| 9 | fcb90b64ac72 | 2026-09-07 | `name_folded` in `shelf` and `tag`; the unique indexes move to it |
| 10 | ede8e57ae05c | 2026-09-14 | Data only: removes years that were really the build date of a file |
| 11 | c06126bfeef6 | 2026-11-14 | Data only: deletes conversations that deleted users left |
| 12 | 58dc777b7e31 | 2026-11-14 | The six `CHECK` constraints. First repairs every value outside the range |
| 13 | a6a7fa951ca6 | 2026-10-18 | `chunk`, `chunk_vector`, `chunk_fts` and its triggers. Written before revisions 11 and 12, and placed after them at the merge |

Six migrations change existing rows, and each one handles the hard cases, so
that it cannot fail in the middle on a real library. For example, revision 12
moves a value outside the range to the nearest allowed value before it adds
the rule. To change a table, SQLite builds a new table and drops the old one,
so the foreign key check is turned off while the migrations run.

**The DDL script.** The file `schema.sql` is the same structure as one SQL
file. The script `dump_schema.py` writes it: it runs every migration on an
empty database and copies the result. So the file cannot be different from
what the application builds. A database made from `schema.sql` was compared
with a migrated one on 14 November 2026: all 39 objects (tables, indexes and
triggers) were the same.

## 2.6 Test data

[[TABLE: Sources of test data]]

| Source | What it gives |
|---|---|
| `test-data.sql` | 3 users, 5 books and rows in every table except the search index, chosen to show the edge cases |
| The automated tests | Each test builds its rows in its own temporary database. Code builds the EPUB files, also broken ones |
| The experiment corpus | 40 real public-domain books in the experiment's own database, cut into 9,476 chunks |
| A scratch installation | An empty, working Libra with one administrator, deleted at every run |

**Edge cases in `test-data.sql`:** a book without a year, a description or a
page count; names in Cyrillic; a book with several authors; a book with no
known uploader; an expired session; two readers with a shelf and a tag of the
same name; a tag that is on no book; a book that is finished but not rated; a
note without a page; a conversation without messages. The file was loaded and
checked on 14 November 2026: no row breaks a foreign key, and all three
accounts can sign in.

**Reference data.** Libra has no table of fixed values, such as countries or
statuses. The nearest thing is the global tags, and two of them are in
`test-data.sql`.

## 2.7 Roles and access

**Roles in the application.** Libra has three roles. One place in the code
checks them on every request (`current_user` and `require_admin` in
`app/auth.py`).

[[TABLE: Roles in the application]]

| Role in the application | Who | Rights |
|---|---|---|
| Not signed in | Anybody | Sign in and read the health check. Nothing else |
| Reader | A signed-in user | Read the catalogue, upload books, and read and write **their own** shelves, tags, ratings, progress, notes and conversation |
| Administrator | A user with `is_admin` | Everything a reader can do. Also: edit and delete books, manage global tags, manage users |

An administrator cannot read another person's private shelves, notes or
conversation. The first administrator is created on the command line, never
through the web. A test checks every route of the API and fails if a new
route is open, so the rights stay correct when objects are added.

**Roles in the database.** SQLite has no user accounts and no `GRANT`. The
roles `app_read`, `app_write` and `admin` from the requirements cannot be
created in it. Three things replace them:

- **One program opens the database.** The Libra server is the only client,
  and SQLite listens on no network port.
- **The operating system protects the file.** In Docker, the file is in a
  volume that only the container uses.
- **No superuser.** SQLite has no superuser account, and in the Docker image
  the server runs as the user `libra`, not as `root`.

## 2.8 Passwords and personal data

**Passwords and secrets.**

- Passwords are stored only as **Argon2id** hashes with the parameters of
  RFC 9106 (64 MiB of memory, 3 passes, 4 lanes) and a random salt for each
  password [@rfc9106]. MD5 and SHA-1 are not used.
- A sign-in with an unknown name takes the same time as one with a wrong
  password, so the time does not show which names exist.
- A session token is 32 random bytes. The database stores only its SHA-256
  hash, so a person who reads the database cannot sign in as somebody else.
- The password hash is never sent to a client, and no password is written to
  a log.

**Personal data.** Libra stores no real name, no phone number and no sign-in
email.

[[TABLE: Personal data]]

| Data | Column | Who can read it |
|---|---|---|
| Sign-in name | `user.username` | The user and administrators. A public shelf also shows the name of its owner |
| Kindle address | `user.kindle_email` | The user and administrators |
| Notes | `note.text` | Only the writer |
| Questions to the Librarian | `message.content` | Only the reader |
| Reading history | `user_book_state` | Only the reader; other people only for books on a shelf that the reader made public |

A household that runs Libra for its own members is outside the GDPR
(Art. 2(2)(c)) [@gdpr], but the database follows its principles. Deleting a
user deletes their sessions, shelves, personal tags, reading state, notes and
conversation in one transaction.

**Data that leaves the server.** "Send to Kindle" gives the reader's Kindle
address to the mail server that the administrator configured. Search by
descriptors will send each question to an external language model, so the
administrator will be able to turn the model off.

## 2.9 The Librarian's tables

**The chat.** `conversation` and `message` were added by revision 7.

A reader has one conversation. A question is saved and committed **before**
the reply starts, so it is not lost if the reply fails. A complete reply is
saved as one `message` row, with the Librarian's steps in `meta`. A request
for another reader's conversation gets "not found". Today the text of a reply
comes from a fixed list in `app/librarian.py`. When search is connected, this
one module is replaced and the tables do not change.

**The search index.** `chunk`, `chunk_vector` and `chunk_fts` were added by
revision 13. The data is written in three steps:

1. A book is cut into chunks of about 250 to 300 words. A chunk never crosses
   a chapter, and chunks do not overlap. Each chunk is one row in `chunk`.
2. The triggers add each chunk to the full-text index.
3. An embedding model turns each chunk into a vector of 768 numbers. Each
   vector is one row in `chunk_vector`.

Today the command `rag index` fills the index for the 40 test books, in the
experiment's own database. A book that a reader uploads is not indexed yet.

Search reads the index in three ways. *Word search (BM25)* is one SQL query:

```sql
SELECT chunk_fts.rowid
FROM chunk_fts JOIN chunk ON chunk.id = chunk_fts.rowid
WHERE chunk_fts MATCH :query AND chunk.chunker_version = :version
ORDER BY bm25(chunk_fts), chunk_fts.rowid
LIMIT :depth;
```

Each word of the question is put in quotes, so words such as `NOT` and `NEAR`
are searched for and do not work as operators. *Search by meaning* reads all
vectors of one model into memory once and scores every chunk against the
vector of the question. *Hybrid search* joins the two ranked lists with
reciprocal rank fusion [@cormack2009].

**Rules that keep the index correct:**

- The unique constraint stops a book from being indexed twice.
- `chunker_version` is part of a chunk's identity. A change of the cutting
  code raises the version, so old and new chunks never mix.
- Search refuses to run if a chunk has no vector for the chosen model. An
  incomplete index would miss passages without any sign.

**Planned changes.** A fourth table, `descriptor`, will store eight short
phrases that a language model writes about each chunk, with their vectors.
For the pre-defense, a reply will show the three best passages, and
`message.meta` will hold a list of citations. This needs no migration, which
is the reason why `meta` is a JSON column.

## 2.10 Limits and planned work

1. **No database roles.** SQLite cannot have them. A read-only connection
   (`mode=ro`) for code that only reads would be the nearest thing. It is not
   used yet.
2. **No views.**
3. **No masking of personal data.** A failed sign-in writes the attempted
   user name to the log.
4. **No stored procedures,** because SQLite has none.
5. **The foreign key check belongs to the connection.** Another program
   that opens the file must set it too. The keys, the unique indexes and the
   `CHECK` constraints are in the file and work for every program.

## 2.11 Chapter conclusions

[[TABLE: The requirements and where they are answered]]

| Requirement | State, and where it is answered |
|---|---|
| Data dictionary, ER diagram, logical schema | Yes. Appendices A and B, Figure 1 |
| DDL script; structure created by scripts, in Git; versions | Yes. `schema.sql`, Section 2.5 |
| 3NF; kinds of relationship; keys, constraints, data types | Yes. Sections 1.3 to 1.5 |
| Integrity and transactions | Yes. Sections 2.1, 2.2 |
| Test data with edge cases | Yes. Section 2.6 |
| Scripts for reference tables | In part. Libra has no reference tables (Section 2.6) |
| Roles `app_read`, `app_write`, `admin` | In part. Roles exist in the application, not in SQLite (Section 2.7) |
| No superuser; rights updated; hashed passwords | Yes. Sections 2.7, 2.8 |
| No free JSON without a model | Yes. Section 1.6 |
| A modern relational DBMS; several DBMS and data layers | Yes. One DBMS is enough; reasons in Section 1.1 |
| Indexes, triggers, user-defined functions | Yes. Sections 2.3, 2.4 |
| Stored procedures, views, masking of personal data | No. Section 2.10 |

All minimum requirements are met, two of them in part. Of the maximum
requirements, views and masking of personal data are not done yet.

# List of references

[[REFERENCES]]

# Appendix A. Data dictionary

This is the short form. A star after a name marks a column that may be empty.
FK → names the table that the column points at. UQ is a unique column. (DB)
marks a rule that the database checks; the application checks the other
rules. All times are UTC. The long form is in the file `data-dictionary.pdf`.

[[TABLE: Accounts]]

| Column | Type in the DDL | Key (FK → table) | Meaning and rule |
|---|---|---|---|
| **user** | | | |
| id | INTEGER | PK | The number of the account |
| username | VARCHAR | UQ | The sign-in name, in lower case. Unique (DB) |
| password_hash | VARCHAR | | The Argon2id hash of the password |
| is_admin | BOOLEAN | | 1 for an administrator |
| kindle_email* | VARCHAR | | The address of the person's Kindle |
| created_at | DATETIME | | When the account was created |
| **user_session** | | | |
| token_hash | VARCHAR | PK | SHA-256 of the cookie token |
| user_id | INTEGER | FK → user | The owner of the session |
| kind | VARCHAR | | The kind of client: browser today |
| expires_at | DATETIME | | The end of the session: 14 days by default |
| created_at | DATETIME | | When the person signed in |

[[TABLE: Catalogue]]

| Column | Type in the DDL | Key (FK → table) | Meaning and rule |
|---|---|---|---|
| **book** | | | |
| id | INTEGER | PK | The number of the book |
| title | VARCHAR | | The title, read from the file |
| author | VARCHAR | | The author as text to show |
| format | VARCHAR | | The file format: epub today |
| file_path | VARCHAR | | The file name. Only the server sets it |
| year* | INTEGER | | The year of publication |
| blurb* | VARCHAR | | A short description |
| pages* | INTEGER | | The page count, 1 or more (DB) |
| uploaded_by* | INTEGER | FK → user | Who added the book |
| book_metadata* | JSON | | Other facts from the file (Section 1.6) |
| **tag** | | | |
| id | INTEGER | PK | The number of the tag |
| owner_id* | INTEGER | FK → user | The owner. Empty for a global tag |
| name | VARCHAR | | The name as typed, with no spaces |
| name_folded | VARCHAR | UQ | The name for comparing. Unique per owner (DB) |
| created_at | DATETIME | | When the tag was created |
| **book_tag** | | | |
| book_id | INTEGER | PK, FK → book | The book |
| tag_id | INTEGER | PK, FK → tag | The tag. The pair is unique (DB) |

[[TABLE: Reading]]

| Column | Type in the DDL | Key (FK → table) | Meaning and rule |
|---|---|---|---|
| **user_book_state** | | | |
| user_id | INTEGER | PK, FK → user | The reader |
| book_id | INTEGER | PK, FK → book | The book. One row per reader and book (DB) |
| shelf_id* | INTEGER | FK → shelf | The shelf, of the same reader |
| rating | INTEGER | | Stars, 0 to 5 (DB). 0 means "not rated" |
| progress | FLOAT | | The share that is read, 0 to 1 (DB) |
| position* | VARCHAR | | The exact place where the reader stopped |
| started_at* | DATETIME | | Set when the progress is first above 0 |
| finished_at* | DATETIME | | Set when the progress reaches 1 |
| last_sent_at* | DATETIME | | The last send to the reader's Kindle |
| updated_at | DATETIME | | The last change of the row |
| **shelf** | | | |
| id | INTEGER | PK | The number of the shelf |
| owner_id | INTEGER | FK → user | The owner |
| name | VARCHAR | | The name as typed |
| name_folded | VARCHAR | UQ | The name for comparing. Unique per owner (DB) |
| position | INTEGER | | The place of the shelf in the owner's order |
| visibility | VARCHAR | | private or public (DB) |
| created_at | DATETIME | | When the shelf was created |
| **note** | | | |
| id | INTEGER | PK | The number of the note |
| user_id | INTEGER | FK → user | The writer. Only the writer can read it |
| book_id | INTEGER | FK → book | The book |
| text | VARCHAR | | The note. Not empty |
| page* | INTEGER | | The page, 1 or more (DB) |
| created_at | DATETIME | | When it was written |

[[TABLE: Librarian: chat and search index]]

| Column | Type in the DDL | Key (FK → table) | Meaning and rule |
|---|---|---|---|
| **conversation** | | | |
| id | INTEGER | PK | The number of the conversation |
| user_id | INTEGER | FK → user | The reader. Only this reader can use it |
| title* | VARCHAR | | Not used yet |
| created_at | DATETIME | | When it was created |
| **message** | | | |
| id | INTEGER | PK | The number of the message |
| conversation_id | INTEGER | FK → conversation | The conversation |
| role | VARCHAR | | user or librarian (DB) |
| content | VARCHAR | | The text |
| created_at | DATETIME | | When it was written |
| meta* | JSON | | What the Librarian did (Section 1.6) |
| **chunk** | | | |
| id | INTEGER | PK | The number of the chunk |
| book_id | INTEGER | FK → book, UQ | The book |
| position | INTEGER | UQ | The number of the chunk in the book |
| spine_index | INTEGER | | The file of the EPUB: one file, one chapter |
| chapter_title* | VARCHAR | | The title of the chapter |
| text | VARCHAR | | The passage: body paragraphs only |
| word_count | INTEGER | | Words in the text. A chunk closes at 250 |
| token_count | INTEGER | | Tokens in the text: 450 at most |
| chunker_version | INTEGER | UQ | The version of the cutting code: 1 today |
| **chunk_vector** | | | |
| chunk_id | INTEGER | PK, FK → chunk | The chunk |
| model | VARCHAR | PK | The embedding model |
| vector | BLOB | | 768 32-bit floats: 3,072 bytes |
| **chunk_fts** | | | |
| rowid | INTEGER | PK | The same number as chunk.id (DB, triggers) |
| text | FTS5 index | | The words of chunk.text, with stemming |

In `chunk`, the three UQ columns are unique together. The table
`alembic_version` has one row with the revision of the schema. Only the
migration tool reads and writes it.

# Appendix B. ER diagram

[[FIGURE: er.png | ER diagram: every table with its columns and keys, full size]]

# Statements

**Use of AI.** The following AI tools were used in this work:

| Tool | What it was used for |
|---|---|
| Claude (Anthropic) | Drafting the structure and a first version of the text from the project's own code and documentation; writing the script that draws the two diagrams; checking the text against the code |

The author reviewed and corrected all AI output before using it, and is
responsible for the content of this document.

**Project type.** Individual project; no table of contributions is needed.

**Organisation's consent.** The project is not done for an organisation and
uses no organisation's data. The test rows are invented, and the test books
are public-domain texts from Standard Ebooks.
