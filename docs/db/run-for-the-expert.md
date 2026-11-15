# How to look at the Libra database

This page is for the expert who assesses the database block. It gives two
ways to see the database.

- **Way 1** takes one minute. It builds a small database from two SQL files.
  It needs only Python.
- **Way 2** is optional and takes longer. It runs Libra itself on the database
  of the experiment: 40 real books, cut into 9,476 passages for search.

The project is at https://github.com/eugene-chekan/libra. All commands below
use the branch `main`.

## Way 1: the test database, without Libra

You need Git and Python 3.

1. Copy the project to your computer:

   ```bash
   git clone https://github.com/eugene-chekan/libra.git
   ```

   ```bash
   cd libra
   ```

2. Build `demo.db` from the DDL script and the test rows. The command prints
   `[]` when no row breaks a foreign key:

   ```bash
   python -c "import sqlite3; c = sqlite3.connect('demo.db'); [c.executescript(open(f, encoding='utf-8').read()) for f in ('docs/db/schema.sql', 'docs/db/test-data.sql')]; print(c.execute('PRAGMA foreign_key_check').fetchall())"
   ```

3. Open `demo.db` in any SQLite program, for example
   [DB Browser for SQLite](https://sqlitebrowser.org/). It has 3 users,
   5 books, and rows in every table except the search index.

SQLite checks foreign keys only when the connection asks for it. To test a
foreign key by hand, run this first in your SQLite program:

```sql
PRAGMA foreign_keys = ON;
```

## Way 2: Libra on the experiment database

This way is optional. Way 1 is enough to assess the structure.

The steps are in the project's own file,
[experiment/README.md](../../experiment/README.md), so they are not repeated
here. Follow three of its sections, in this order:

1. **The files**: download the 42 book files (32 MB) and unzip them.
2. **The database**: create the database, add the 40 test books, and fill the
   search index. The first run downloads a language model that turns text
   into vectors (about 210 MB).
3. **Browsing the books in libra**: start Libra at http://localhost:8001 and
   sign in as `admin`. You choose the password yourself: a new database has
   no account, so the first start asks you to type a password for `admin`,
   two times. Nothing shows on the screen while you type it.

That file is written for the author, so it does not list the programs. You
need these three:

| Program | Why | Where to get it |
|---|---|---|
| Git | Copies the project | https://git-scm.com |
| uv | Installs Python and the server's libraries | https://docs.astral.sh/uv/ |
| Node.js | Builds the web pages of Libra. Node.js is a program that runs JavaScript outside a browser | https://nodejs.org, the LTS version |

### What you will see

- **In Libra:** the 40 books in the catalogue. You can open a book, read it,
  put it on a shelf, rate it, add tags and notes. Each of these writes rows
  that the database block describes.
- **The Librarian panel** opens and saves your questions, but its replies are
  a fixed text today. Search is not connected to the panel yet (Section 2.9
  of the document).
- **In the database file:** `.run/experiment/libra.db`. Open it in any SQLite
  program while Libra is stopped. The tables `chunk` and `chunk_vector` hold
  9,476 rows each, and `chunk_fts` is the full-text index.

A query to try on that file. It finds the five passages that best match two
words, with BM25 ranking:

```sql
SELECT book.title, chunk.chapter_title, substr(chunk.text, 1, 120)
FROM chunk_fts
JOIN chunk ON chunk.id = chunk_fts.rowid
JOIN book ON book.id = chunk.book_id
WHERE chunk_fts MATCH '"storm" "ship"'
ORDER BY bm25(chunk_fts)
LIMIT 5;
```

To remove everything, delete the folder `libra`.
