# Data dictionary

Every table and column of the libra database. The main text is in
[database.md](database.md). The exact DDL is in [schema.sql](schema.sql).

**How to read the tables below.**

- **Type** is the type in the DDL. SQLite stores `VARCHAR` as text of any
  length, `BOOLEAN` as 0 or 1, `DATETIME` as text, and `JSON` as text.
- **Null** says whether the column may be empty. "no" means `NOT NULL`.
- **Key** is `PK` (primary key), `FK` (foreign key) or `UQ` (unique). The
  database checks every `FK`: the row it names must exist, and that row
  cannot be deleted while this one points at it.
- **Rule** is what a correct value looks like. The letters say who checks it:
  - **(DB)** the database itself, with a constraint or an index;
  - **(App)** the application, before it writes the row.
- All dates and times are UTC, with no time zone stored.

**Layers.** The database has one layer. Every table is live application data,
read and written by the running application. There are no raw, staging or
data-mart layers. [database.md](database.md#why-one-dbms-and-one-layer)
explains why.

**Blocks.** The tables form five blocks:

| Block | Tables | Who owns the rows |
|---|---|---|
| Accounts | `user`, `user_session` | each account |
| Catalogue | `book`, `tag`, `book_tag` | shared by everybody |
| Reading | `user_book_state`, `shelf`, `note` | one reader |
| Librarian: chat | `conversation`, `message` | one reader |
| Librarian: search index | `chunk`, `chunk_vector`, `chunk_fts` | shared; made from the books |

---

## Accounts

### `user`

A person with an account on this installation.

| Column | Type | Null | Key | Meaning | Rule |
|---|---|---|---|---|---|
| `id` | INTEGER | no | PK | The account's number | Given by the database (DB) |
| `username` | VARCHAR | no | UQ | The name used to sign in | Unique (DB, `ix_user_username`). Stored trimmed and in lower case, never empty (App) |
| `password_hash` | VARCHAR | no | | The Argon2id hash of the password | Always a hash, never the password (App). Starts with `$argon2id$` |
| `is_admin` | BOOLEAN | no | | 1 for an admin, 0 for a reader | Only an admin can change it, and not on their own account (App) |
| `kindle_email` | VARCHAR | yes | | The address of this person's Kindle | Empty until the person sets it. Its format is not checked today |
| `created_at` | DATETIME | no | | When the account was made | Set once (App) |

Personal data: `username`, `kindle_email`.

### `user_session`

One signed-in browser. The browser holds a random token in a cookie. The
table holds only the hash of that token.

| Column | Type | Null | Key | Meaning | Rule |
|---|---|---|---|---|---|
| `token_hash` | VARCHAR | no | PK | SHA-256 of the cookie token, as 64 hex characters | The token itself is 32 random bytes and is never stored (App) |
| `user_id` | INTEGER | no | FK → `user.id` | Whose session it is | Indexed (`ix_user_session_user_id`) |
| `kind` | VARCHAR | no | | `browser` today. `device` is kept for a later phone or desktop client | (App) |
| `expires_at` | DATETIME | no | | When the session stops working | `created_at` plus 14 days by default (App). An expired row is deleted when it is next used, or by "Prune sessions" |
| `created_at` | DATETIME | no | | When the person signed in | Set once (App) |

---

## Catalogue

### `book`

One book in the shared catalogue. One EPUB file gives one row. Nothing about
a single reader is stored here.

| Column | Type | Null | Key | Meaning | Rule |
|---|---|---|---|---|---|
| `id` | INTEGER | no | PK | The book's number | Given by the database (DB) |
| `title` | VARCHAR | no | | The title | Read from the file. If the file has none, the file name is used (App) |
| `author` | VARCHAR | no | | The author, as text to show | Read from the file. Several authors are joined with ", ". `Unknown` if the file names none (App) |
| `format` | VARCHAR | no | | The file format | `epub` today (App) |
| `file_path` | VARCHAR | no | | Where the file is, inside the library folder | A name the server makes itself: 32 hex characters plus `.epub`. A client can never set it (App) |
| `year` | INTEGER | yes | | The year the work was published | From 1450 to next year, or empty when the file does not say (App) |
| `blurb` | VARCHAR | yes | | A short description | From the file, or typed by an admin |
| `pages` | INTEGER | yes | | Print page count | 1 or more (DB, `ck_book_pages`) |
| `uploaded_by` | INTEGER | yes | FK → `user.id` | Who added the book | A record only: it gives no rights. Empty after that account is deleted (App) |
| `book_metadata` | JSON | yes | | Other facts from the file | A JSON object with the keys below (App) |

**The keys of `book_metadata`.** Every key is optional except the three marked
"always".

| Key | JSON type | Meaning |
|---|---|---|
| `sha256` | string, always | SHA-256 of the file. It tells two copies of the same file apart from two editions |
| `original_filename` | string, always | The file's name when it was uploaded |
| `size_bytes` | number, always | The file's size |
| `language` | string | `dc:language` from the file, for example `en-GB` |
| `publisher` | string | `dc:publisher` |
| `published` | string | The date exactly as the file wrote it. `year` is worked out from this |
| `identifiers` | list of strings | `dc:identifier` values: ISBN, a web address, a UUID |
| `subjects` | list of strings | `dc:subject` values, kept as the file wrote them |
| `authors` | list of strings | Every author, only when the file names more than one |
| `cover_href`, `cover_media_type` | string | Where the cover picture is inside the EPUB, and its type. Only when the file declares a cover |
| `custom_cover_path`, `custom_cover_media_type` | string | A cover that a person uploaded in place of the file's own |

A cover type is always one of `image/jpeg`, `image/png`, `image/gif`,
`image/webp`.

### `tag`

A label that can be put on books. There are two kinds. A **global** tag has no
owner: an admin makes it and everybody sees it. A **personal** tag has an
owner, and only the owner sees it.

| Column | Type | Null | Key | Meaning | Rule |
|---|---|---|---|---|---|
| `id` | INTEGER | no | PK | The tag's number | Given by the database (DB) |
| `owner_id` | INTEGER | yes | FK → `user.id` | The owner. Empty means a global tag | Indexed (`ix_tag_owner_id`) |
| `name` | VARCHAR | no | | The name as the person typed it | Not empty, and no spaces inside (App) |
| `name_folded` | VARCHAR | no | UQ | The name in a form for comparing: Unicode NFC, then case-folded | Unique for one owner (DB, `ix_tag_owner_name`). Unique among global tags (DB, `ix_tag_global_name`). Always worked out from `name` on every write (App). A personal tag may not have the name of a global tag (App) |
| `created_at` | DATETIME | no | | When the tag was made | Set once (App) |

### `book_tag`

Which book carries which tag. It links `book` and `tag`, many to many.

| Column | Type | Null | Key | Meaning | Rule |
|---|---|---|---|---|---|
| `book_id` | INTEGER | no | PK, FK → `book.id` | The book | The pair is unique (DB, primary key) |
| `tag_id` | INTEGER | no | PK, FK → `tag.id` | The tag | Only an admin links a global tag. Only the owner links a personal tag (App) |

There is no user column. A personal tag is seen only by its owner, so its
links are seen only by its owner too.

---

## Reading

### `user_book_state`

What one reader has done with one book. A row is made the first time the
reader touches the book. No row means: not rated, not started, on no shelf.

| Column | Type | Null | Key | Meaning | Rule |
|---|---|---|---|---|---|
| `user_id` | INTEGER | no | PK, FK → `user.id` | The reader | One row for each reader and book (DB, primary key) |
| `book_id` | INTEGER | no | PK, FK → `book.id` | The book | |
| `shelf_id` | INTEGER | yes | FK → `shelf.id` | The shelf the reader put the book on | Empty means no shelf. The shelf must belong to the same reader (App). One column, so a book is on at most one shelf of a reader (DB, by design) |
| `rating` | INTEGER | no | | Stars | 0 to 5. 0 means "not rated" (DB, `ck_user_book_state_rating`) |
| `progress` | FLOAT | no | | How far through the book | 0 to 1 (DB, `ck_user_book_state_progress`) |
| `position` | VARCHAR | yes | | The exact place where the reader stopped | An EPUB CFI, written by the reading screen. At most 1000 characters. The server never reads it (App) |
| `started_at` | DATETIME | yes | | When reading began | Set the first time `progress` is above 0 (App) |
| `finished_at` | DATETIME | yes | | When the book was finished | Set when `progress` reaches 1. Cleared if `progress` goes below 1 again (App) |
| `last_sent_at` | DATETIME | yes | | When the book was last sent to this reader's Kindle | Set on each send (App) |
| `updated_at` | DATETIME | no | | When the row last changed | Set on every write (App) |

### `shelf`

A named list of books that belongs to one reader.

| Column | Type | Null | Key | Meaning | Rule |
|---|---|---|---|---|---|
| `id` | INTEGER | no | PK | The shelf's number | Given by the database (DB) |
| `owner_id` | INTEGER | no | FK → `user.id` | The owner | Indexed (`ix_shelf_owner_id`) |
| `name` | VARCHAR | no | | The name as typed | Trimmed (App) |
| `name_folded` | VARCHAR | no | UQ | The name in a form for comparing | Unique for one owner (DB, `ix_shelf_owner_name`). Always worked out from `name` (App) |
| `position` | INTEGER | no | | The shelf's place in the owner's order | Starts at 0. A reorder rewrites every position of the owner in one transaction (App) |
| `visibility` | VARCHAR | no | | Who may see the shelf | `private` or `public` (DB, `ck_shelf_visibility`). A public shelf can be read by others, never changed |
| `created_at` | DATETIME | no | | When the shelf was made | Set once (App) |

### `note`

A note or a highlight that a reader wrote about a book.

| Column | Type | Null | Key | Meaning | Rule |
|---|---|---|---|---|---|
| `id` | INTEGER | no | PK | The note's number | Given by the database (DB) |
| `user_id` | INTEGER | no | FK → `user.id` | Who wrote it | Indexed (`ix_note_user_id`). Only the writer can read or change it (App) |
| `book_id` | INTEGER | no | FK → `book.id` | The book | Indexed (`ix_note_book_id`) |
| `text` | VARCHAR | no | | The note | Trimmed and not empty (App) |
| `page` | INTEGER | yes | | The page the note is about | 1 or more, or empty (DB, `ck_note_page`) |
| `created_at` | DATETIME | no | | When it was written | Set once (App) |

Personal data: `text` is private writing.

---

## Librarian: chat

### `conversation`

One reader's talk with the librarian. Each reader has one conversation. It is
made the first time the reader opens the panel.

| Column | Type | Null | Key | Meaning | Rule |
|---|---|---|---|---|---|
| `id` | INTEGER | no | PK | The conversation's number | Given by the database (DB) |
| `user_id` | INTEGER | no | FK → `user.id` | The reader | Indexed (`ix_conversation_user_id`). Only this reader can read it or write to it (App). Deleted together with the reader (App) |
| `title` | VARCHAR | yes | | A title | Not used yet. Kept for the time a reader has more than one conversation |
| `created_at` | DATETIME | no | | When it was made | Set once (App) |

### `message`

One turn in a conversation: a question from the reader, or a reply from the
librarian.

| Column | Type | Null | Key | Meaning | Rule |
|---|---|---|---|---|---|
| `id` | INTEGER | no | PK | The message's number | Given by the database (DB) |
| `conversation_id` | INTEGER | no | FK → `conversation.id` | The conversation | Indexed (`ix_message_conversation_id`) |
| `role` | VARCHAR | no | | Who wrote it | `user` or `librarian` (DB, `ck_message_role`) |
| `content` | VARCHAR | no | | The text | A question is never empty (App) |
| `created_at` | DATETIME | no | | When it was written | Messages are shown in this order, then by `id` |
| `meta` | JSON | yes | | What the librarian did to make a reply | A JSON object with the keys below (App) |

**The keys of `meta`.** A reader's message holds an empty object.

| Key | JSON type | Meaning |
|---|---|---|
| `tool_call` | object: `summary` (string) | The search step, as one line to show. Example: `Searched your library · 40 books` |
| `citation` | object: `book_id` (number), `title` (string) | The book the reply points at. Missing when the reply names no book. Planned: a list of passages, each with the book, the chapter title and an excerpt. A single object will then be read as a list of one |

Personal data: `content` is what the reader asked.

---

## Librarian: search index

These three objects hold the book text for search. How search reads them is
in [database.md](database.md#the-search-index).

### `chunk`

One passage of a book's text, about 250 to 300 words. Search finds chunks.

| Column | Type | Null | Key | Meaning | Rule |
|---|---|---|---|---|---|
| `id` | INTEGER | no | PK | The chunk's number | Given by the database (DB) |
| `book_id` | INTEGER | no | FK → `book.id` | The book | Indexed (`ix_chunk_book_id`) |
| `position` | INTEGER | no | UQ | The chunk's number inside the book, in reading order | Unique together with `book_id` and `chunker_version` (DB, `uq_chunk_book_version_position`) |
| `spine_index` | INTEGER | no | | Which file of the EPUB the chunk comes from. One file is one chapter | A chunk never crosses a chapter (App) |
| `chapter_title` | VARCHAR | yes | | The chapter's title | Empty when the chapter has none |
| `text` | VARCHAR | no | | The passage | Body paragraphs only: no headings, no note numbers (App) |
| `word_count` | INTEGER | no | | Words in `text` | A chunk closes at 250 words (App) |
| `token_count` | INTEGER | no | | Tokens in `text`, counted by the embedding model's tokenizer | At most 450 (App) |
| `chunker_version` | INTEGER | no | UQ | The version of the code that cut the book | 1 today. A change to the chunker raises it (App) |

### `chunk_vector`

The embedding of one chunk by one model: a list of numbers that stands for
the meaning of the passage.

| Column | Type | Null | Key | Meaning | Rule |
|---|---|---|---|---|---|
| `chunk_id` | INTEGER | no | PK, FK → `chunk.id` | The chunk | One vector for each chunk and model (DB, primary key) |
| `model` | VARCHAR | no | PK | The embedding model's name | `BAAI/bge-base-en-v1.5` today |
| `vector` | BLOB | no | | The numbers | 32-bit floats, little-endian, unit length. 768 numbers, so 3072 bytes, for the model above (App) |

### `chunk_fts`

A full-text index over `chunk.text`. It is an FTS5 virtual table. It keeps no
copy of the text: it reads `chunk` (the "external content" form). Three
triggers on `chunk` keep it correct.

| Column | Type | Meaning | Rule |
|---|---|---|---|
| `rowid` | INTEGER | The same number as `chunk.id` | Kept equal by the triggers (DB) |
| `text` | (indexed text) | The words of `chunk.text` | Tokenizer `porter unicode61`: words are stemmed, so "walked" finds "walk" |

### `descriptor` (planned)

Not built yet. It will hold the short phrases that a language model writes
about each chunk, for the third search method of the experiment.

| Column | Meaning |
|---|---|
| `chunk_id` | The chunk, FK → `chunk.id` |
| `position` | The descriptor's number for this chunk, 0 to 7 |
| `text` | The phrase, 2 to 6 words |
| `prompt_version` | The version of the prompt that produced it |
| `vector` | The phrase's embedding, stored like `chunk_vector.vector` |

---

## Housekeeping

### `alembic_version`

One row. It names the schema revision the database is at. Alembic, the
migration tool, reads and writes it. The application never does.

| Column | Type | Null | Key | Meaning |
|---|---|---|---|---|
| `version_num` | VARCHAR(32) | no | PK | The revision id, for example `a6a7fa951ca6` |
