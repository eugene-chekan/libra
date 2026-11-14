-- libra: test data for an empty database made from schema.sql.
--
-- What it is for: reading the database, trying queries, and showing the edge
-- cases the schema allows. It was written for schema revision a6a7fa951ca6.
-- It fills every table except the search index (chunk, chunk_vector), which
-- the command `rag index` fills. Load it once, into an empty database:
--
--     sqlite3 demo.db < docs/db/schema.sql
--     sqlite3 demo.db < docs/db/test-data.sql
--
-- The three accounts all have the password  libra-demo-password . It is a test
-- value, used nowhere else. Only its Argon2id hash is stored, as in a real
-- installation.
--
-- The five books have no EPUB files behind them. The catalogue, the shelves,
-- the tags, the notes and the librarian panel all work. Opening or sending a
-- book answers "file missing", and the admin's maintenance page lists all
-- five as missing files. For real books, load the 40 experiment books with
-- `rag load-corpus` (see experiment/README.md).
--
-- libra has no reference tables with fixed rows. The nearest thing is the
-- global tags (owner_id IS NULL), which an admin curates for everyone. They
-- are in section 4.
--
-- Date and time values are UTC, in the text format SQLAlchemy writes.
-- Every row obeys every foreign key: the file turns checking on to prove it.

PRAGMA foreign_keys = ON;

BEGIN;

-- 1. Accounts -------------------------------------------------------------
-- One admin and two readers. Usernames are stored trimmed and in lower case.
-- Edge case: boris has no Kindle address (NULL).
INSERT INTO user (id, username, password_hash, is_admin, kindle_email, created_at) VALUES
  (1, 'admin', '$argon2id$v=19$m=65536,t=3,p=4$r3tfFgapzFyoKiYGqlqaDA$nUv7eQ72cvBenpORU/64m4pc6AP793ME55t+hm1NMMY', 1, 'admin-kindle@example.com', '2026-08-05 09:00:00.000000'),
  (2, 'anna',  '$argon2id$v=19$m=65536,t=3,p=4$JsetUe+WVZ1i6SBlgAGE5A$WH0YXClHE+bVOQKbnJ4/g6jMraQigdn9XgQlrcnDPXM', 0, 'anna-kindle@example.com',  '2026-08-06 18:30:00.000000'),
  (3, 'boris', '$argon2id$v=19$m=65536,t=3,p=4$xZ7NqtkUWXXXofd744COfQ$vyc4Yx6w/Hv8rZ+2CWl9eaY05X/zZI2hsOUGfYlFMXg', 0, NULL,                       '2026-08-07 11:15:00.000000');

-- 2. Sessions -------------------------------------------------------------
-- The key is the SHA-256 hash of the cookie token, never the token.
-- Edge case: the second session has expired. "Prune sessions" on the
-- maintenance page deletes it.
INSERT INTO user_session (token_hash, user_id, kind, expires_at, created_at) VALUES
  ('59e3499ee65adc9027740c166997d8d71b7b0af1a9231ed7d21941e590d4c135', 2, 'browser', '2099-01-01 00:00:00.000000', '2026-11-01 08:00:00.000000'),
  ('fa836c69462267ff5b2f8272d8f635520f5c28d9d86e1c99b35d09566e46e132', 3, 'browser', '2026-09-01 00:00:00.000000', '2026-08-18 00:00:00.000000');

-- 3. Books: the shared catalogue ------------------------------------------
-- Book 1: every field filled, with the full metadata document.
-- Book 2: the file said nothing about year, blurb or pages (all NULL).
-- Book 3: a title and an author in Cyrillic, for search in any alphabet.
-- Book 4: three authors. `author` is the text to show; the list is in the
--         metadata document.
-- Book 5: nobody is recorded as the uploader (NULL), as after that account
--         was deleted. The file had no author either, so it is "Unknown".
INSERT INTO book (id, title, author, format, file_path, year, blurb, pages, uploaded_by, book_metadata) VALUES
  (1, 'Huntingtower', 'John Buchan', 'epub', 'demo-0001.epub', 1922,
   'A retired Glasgow grocer walks into a plot against a Russian princess.', 215, 1,
   '{"language": "en-GB", "publisher": "Standard Ebooks", "identifiers": ["url:https://standardebooks.org/ebooks/john-buchan/huntingtower"], "subjects": ["Adventure stories", "Scotland -- Fiction"], "published": "1922", "original_filename": "john-buchan_huntingtower.epub", "size_bytes": 512044, "cover_href": "epub/images/cover.jpg", "cover_media_type": "image/jpeg", "sha256": "5d34cf1cbca72d91572b4a4afa2168de51feabf8be752f43d89e72039696150c"}'),
  (2, 'Notes from a Small Workshop', 'E. Carver', 'epub', 'demo-0002.epub', NULL, NULL, NULL, 2,
   '{"original_filename": "workshop.epub", "size_bytes": 88310, "sha256": "0000000000000000000000000000000000000000000000000000000000000002"}'),
  (3, 'Мы', 'Евгений Замятин', 'epub', 'demo-0003.epub', 1924,
   'Антиутопия о Едином Государстве.', 180, 3,
   '{"language": "ru", "published": "1924", "original_filename": "zamyatin_my.epub", "size_bytes": 301775, "sha256": "0000000000000000000000000000000000000000000000000000000000000003"}'),
  (4, 'The Federalist Papers', 'Alexander Hamilton, James Madison, John Jay', 'epub', 'demo-0004.epub', 1788,
   'Eighty-five essays arguing for the United States Constitution.', 520, 1,
   '{"language": "en-US", "authors": ["Alexander Hamilton", "James Madison", "John Jay"], "subjects": ["Constitutional history -- United States"], "published": "1788-05-28", "original_filename": "federalist.epub", "size_bytes": 1204880, "sha256": "0000000000000000000000000000000000000000000000000000000000000004"}'),
  (5, 'An Old Almanac', 'Unknown', 'epub', 'demo-0005.epub', NULL, NULL, 64, NULL,
   '{"original_filename": "almanac.epub", "size_bytes": 40960, "sha256": "0000000000000000000000000000000000000000000000000000000000000005"}');

-- 4. Tags -----------------------------------------------------------------
-- Tags 1 and 2 are global (owner_id IS NULL): the fixed vocabulary.
-- Tags 3 to 5 are personal.
-- Edge case: anna and boris each have a tag called "lent-out". A name must be
-- unique for one owner, not for everybody.
-- `name_folded` is the name in NFC, case-folded. The unique indexes use it.
INSERT INTO tag (id, owner_id, name, name_folded, created_at) VALUES
  (1, NULL, 'Sci-Fi',               'sci-fi',               '2026-08-09 10:00:00.000000'),
  (2, NULL, 'Classic',              'classic',              '2026-08-09 10:00:30.000000'),
  (3, 2,    'read-before-the-trip', 'read-before-the-trip', '2026-08-20 19:00:00.000000'),
  (4, 2,    'lent-out',             'lent-out',             '2026-08-21 12:00:00.000000'),
  (5, 3,    'lent-out',             'lent-out',             '2026-08-22 12:00:00.000000');

-- A book carries many tags, and a tag sits on many books.
-- Edge case: tag 4 (anna's "lent-out") is on no book. A tag may exist unused.
INSERT INTO book_tag (book_id, tag_id) VALUES
  (1, 2),
  (3, 1),
  (3, 2),
  (4, 2),
  (1, 3),
  (3, 5);

-- 5. Shelves --------------------------------------------------------------
-- Every shelf has an owner. `position` is the owner's own order, from 0.
-- Edge cases: two owners both have "To Read"; a name in Cyrillic; one public
-- shelf for each reader.
INSERT INTO shelf (id, owner_id, name, name_folded, position, visibility, created_at) VALUES
  (1, 2, 'To Read',           'to read',           0, 'private', '2026-08-10 09:00:00.000000'),
  (2, 2, 'Currently Reading', 'currently reading', 1, 'public',  '2026-08-10 09:00:10.000000'),
  (3, 3, 'To Read',           'to read',           0, 'private', '2026-08-11 09:00:00.000000'),
  (4, 3, 'Фантастика',        'фантастика',        1, 'public',  '2026-08-11 09:05:00.000000');

-- 6. Reading state: one row for one reader and one book --------------------
-- A row appears the first time a reader touches a book. No row means "not
-- rated, not started, on no shelf".
--   (2,1) in progress: on a shelf, rated, with an exact place in the book.
--   (2,4) finished and sent to the Kindle, but not rated (0) and on no shelf.
--   (2,3) only placed on a shelf.
--   (3,1) rated, never opened.
--   (3,3) on boris's own public shelf, half read.
-- A shelf_id always names a shelf of the same user.
INSERT INTO user_book_state (user_id, book_id, shelf_id, rating, progress, position, started_at, finished_at, last_sent_at, updated_at) VALUES
  (2, 1, 2,    5, 0.42, 'epubcfi(/6/14!/4/2/18/1:0)', '2026-10-02 20:15:00.000000', NULL,                         NULL,                         '2026-11-10 21:40:00.000000'),
  (2, 4, NULL, 0, 1.0,  NULL,                         '2026-09-01 08:00:00.000000', '2026-09-28 22:10:00.000000', '2026-08-31 19:00:00.000000', '2026-09-28 22:10:00.000000'),
  (2, 3, 1,    0, 0.0,  NULL,                         NULL,                         NULL,                         NULL,                         '2026-10-05 10:00:00.000000'),
  (3, 1, NULL, 3, 0.0,  NULL,                         NULL,                         NULL,                         NULL,                         '2026-10-12 17:30:00.000000'),
  (3, 3, 4,    4, 0.5,  'epubcfi(/6/22!/4/2/6/1:120)', '2026-10-20 07:45:00.000000', NULL,                         NULL,                         '2026-11-12 07:50:00.000000');

-- 7. Notes ----------------------------------------------------------------
-- Edge cases: a note with no page (NULL); a note in Cyrillic.
INSERT INTO note (id, user_id, book_id, text, page, created_at) VALUES
  (1, 2, 1, 'Dickson McCunn retires and sets out on foot. The whole plot starts here.', 12,   '2026-10-03 21:00:00.000000'),
  (2, 2, 1, 'Compare the Gorbals Die-Hards with the boys in the later books.',          NULL, '2026-10-09 22:30:00.000000'),
  (3, 3, 3, 'Запись 1-я: всё начинается с газетного объявления.',                       3,    '2026-10-21 08:10:00.000000');

-- 8. The librarian: conversations and messages -----------------------------
-- A reader has one conversation. Edge case: boris's holds no messages yet.
INSERT INTO conversation (id, user_id, title, created_at) VALUES
  (1, 2, NULL, '2026-11-02 19:00:00.000000'),
  (2, 3, NULL, '2026-11-03 09:00:00.000000');

-- `meta` on a reader's message is an empty document. On a reply it records
-- the search step, and the book the reply points at when there is one.
INSERT INTO message (id, conversation_id, role, content, created_at, meta) VALUES
  (1, 1, 'user',      'What should I read next?',                                                  '2026-11-02 19:00:05.000000', '{}'),
  (2, 1, 'librarian', 'Based on what''s in your library, Huntingtower looks like a good next read.', '2026-11-02 19:00:06.000000',
   '{"tool_call": {"summary": "Searched your library · 5 books"}, "citation": {"book_id": 1, "title": "Huntingtower"}}'),
  (3, 1, 'user',      'Is there anything about beekeeping?',                                        '2026-11-02 19:02:00.000000', '{}'),
  (4, 1, 'librarian', 'I couldn''t find anything in your library about that.',                       '2026-11-02 19:02:01.000000',
   '{"tool_call": {"summary": "Searched your library · 5 books"}}');

COMMIT;

-- Lists every row that breaks a foreign key. It must print nothing.
PRAGMA foreign_key_check;
