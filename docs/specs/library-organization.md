# Spec: Library Organization and Multi-User

**Status:** Not started — planning only. Supersedes the single-user draft of
this document. Two inputs: the UI design handoff in
[`docs/design_handoff_libra/`](../design_handoff_libra/README.md), which
assumes a domain model roughly twice the size of the one the API exposes
today, and the decision to support **multiple users on one instance** (shared
family library), which contradicts the current non-goal list in
[architecture.md](../architecture.md) and needs it updated.

## Goal

Give the API the concepts the designed client is built around — shelves,
tags, reading progress, ratings, cover art — and the user model that lets a
household share one library without sharing one reading state.

The design handoff is an input, not a specification: it is a browser
prototype with no persistence and no notion of users, and it says so
("the prototype is silent on API shape, so this is a design decision for the
developer"). Several of its behaviours are listed by its own authors as bugs
to fix rather than reproduce. This spec takes the model it implies, resolves
those bugs, and adds the user dimension it has no concept of.

## Scope

**In scope:**
- **Users and authentication**: password login, sessions, an admin role.
- **Per-user reading state**: rating, progress, shelf placement.
- Promote the file-derived fields the design displays (`year`, `blurb`) from
  the free-form `book_metadata` blob to typed columns on the shared catalog.
- **Shelves**, owned by a user, ordered, private by default and optionally
  publicly readable.
- **Tags**, either admin-owned and global or user-owned and private.
- Filtering and search on `GET /books`, with the semantics the design fixes,
  scoped to what the calling user can see.
- Extract and serve **cover art** from the EPUB.
- CORS configuration, without which no browser client can call the API.
- **Per-user Kindle addresses**, since Kindle delivery is a Phase 1 feature
  and a shared `LIBRA_kindle_email` setting stops making sense the moment
  there are two readers.

**Out of scope (later, or never):**
- **Private books.** The catalog is shared: if a file is in the library,
  every user can see and read it. Per-book access control is a much larger
  feature and nothing in the design suggests it.
- **Collaborative shelves.** Public shelves are read-only to non-owners.
  Multiple editors means conflict resolution, which nothing needs yet.
- Notes and highlights as a **feature**. The `Note` model is defined here and
  created by the migration; no endpoints ship until Phase 2, when RAG
  ingestion is built over the same tables.
- Self-registration, email verification, password reset flows. Admin creates
  accounts. This is a household on a LAN, not a public service.
- Nested shelves, smart/saved searches, per-book reading sessions.
- Pagination of `GET /books`, though the response-envelope decision it forces
  is in scope.
- Any client work. This spec shapes the API the client consumes.

## Data model

### The multi-user seam

The design already draws a line between **file-derived metadata** (title,
author, year, blurb) and **user state** (progress, rating, shelf, tags).
Single-user, that line was a column-grouping preference. Multi-user, it
becomes a **table boundary**, and the design's instinct turns out to have
been right for a reason it could not have known about:

- **Shared** — the catalog. One EPUB file, one `Book` row, one set of parsed
  metadata, one cover, one set of converted formats. A book's title is not a
  matter of opinion.
- **Per-user** — everything about *reading* it. Progress, rating, which shelf
  it sits on.

This also settles the hazard from the single-user draft: `BookUpdate`
replaces `book_metadata` wholesale by design, so a rating stored in that blob
would be clobbered by any concurrent metadata edit. With ratings on their own
per-user table, the two can never collide — and two users rating the same
book concurrently write different rows.

### `User`

```python
class User(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    username: str                      # unique, case-insensitive
    password_hash: str
    is_admin: bool = False
    kindle_email: str | None = None    # per-user; Phase 1 delivery target
    created_at: datetime
```

`kindle_email` is per-user because a household has one library and several
Kindles. This is a direct, unavoidable change to the not-yet-built Kindle
delivery feature, and worth resolving before that feature is designed rather
than after.

### `Book` — the shared catalog

```python
class BookBase(SQLModel):
    title: str
    author: str
    format: str
    file_path: str
    # New, all shared — properties of the edition, not of a reader:
    year: int | None = None            # parsed from dc:date; raw string stays in book_metadata
    blurb: str | None = None           # from dc:description
    pages: int | None = None           # from schema:numberOfPages when declared, else user-entered
    book_metadata: dict = Field(default_factory=dict, sa_column=Column(SA_JSON))

class Book(BookBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    uploaded_by: int | None = Field(default=None, foreign_key="user.id")
```

`uploaded_by` is **provenance, not ownership** — it records who added the
book, and grants no special rights over it. Nullable so that deleting a user
does not require deciding what happens to the books they contributed to a
shared library.

Note what is *absent*: no `shelf_id`, no `rating`, no `progress`. Those moved.

### `UserBookState` — the per-user seam

```python
class UserBookState(SQLModel, table=True):
    user_id: int = Field(foreign_key="user.id", primary_key=True)
    book_id: int = Field(foreign_key="book.id", primary_key=True)
    shelf_id: int | None = Field(default=None, foreign_key="shelf.id")
    rating: int = Field(default=0, ge=0, le=5)      # 0 = unrated
    progress: float = Field(default=0.0, ge=0, le=1)
    started_at: datetime | None = None              # set on first progress > 0
    finished_at: datetime | None = None             # set when progress reaches 1
    updated_at: datetime
```

`started_at` and `finished_at` are here despite nothing in the design showing
a date, because neither can be backfilled — the moment someone wants a
"recently finished" view, the history to build it from either exists or is
permanently lost. Two nullable columns is a cheap hedge against that.

The composite primary key does real work: it makes **"a book is on at most
one of my shelves"** structural rather than an invariant something has to
enforce. That is the design's own model — `shelf` is a single field and "Move
to Shelf" replaces rather than adds — preserved exactly, per user. A
`ShelfBook` link table would have needed a trigger or a subquery constraint
to say the same thing.

Rows are created lazily on first interaction. A user who has never touched a
book has no row, and the API returns the defaults (unrated, no progress, no
shelf) rather than pre-populating one row per user per book at upload.

`rating: 0` means unrated rather than a nullable column, matching the design
("0–5 integer; 0 = unrated") and avoiding a tri-state the star widget cannot
express.

**Integrity rule that no foreign key expresses:** `shelf_id` must reference a
shelf owned by `user_id`, or Dad can place a book on Mom's shelf. SQLite plus
SQLModel makes the composite foreign key that would enforce this awkward, so
it is validated in the route — and therefore needs its own test, since a
route-level guard is only as real as the test that breaks it.

### `Shelf`

```python
class Shelf(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    owner_id: int = Field(foreign_key="user.id")
    name: str                          # unique per owner, case-insensitive
    position: int                      # owner-defined order, contiguous from 0
    visibility: str = "private"        # "private" | "public"
    created_at: datetime
```

Shelves are always owned; there is no global shelf. This follows from what
shelves *mean* in the design — the defaults are `Currently Reading`,
`Completed`, `To Read`, which are statements about a reader, not about a
book. A shared "Currently Reading" would be meaningless the moment two people
used it.

`visibility: "public"` makes a shelf **readable** by other users, never
writable. Only the owner can rename, reorder, delete, or change what is on
it. Viewing a public shelf necessarily exposes the owner's progress on those
books, since the design renders a progress bar under each cover in the
shelves view — that is an intended consequence of publishing a shelf, and
worth stating so it is a decision rather than a leak.

Stable ids are also the fix for the handoff's **Known Gap #1**: the prototype
matches shelves by name, so renaming one silently orphans every book on it.
`ShelfManagerModal.save()` still contains the empty `renameMap` loop where
the workaround was meant to go. With a foreign key, a rename touches one row.

Uniqueness is **per owner** — two users may each have a shelf called
"To Read", and they are different shelves.

### `Tag` and `BookTag`

```python
class Tag(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    owner_id: int | None = Field(default=None, foreign_key="user.id")
    name: str

class BookTag(SQLModel, table=True):
    book_id: int = Field(foreign_key="book.id", primary_key=True)
    tag_id: int = Field(foreign_key="tag.id", primary_key=True)
```

`owner_id IS NULL` means a **global tag**, curated by an admin and visible to
everyone. A non-null `owner_id` means a **personal tag**, visible only to its
owner. The vocabulary a user sees in the sidebar is global ∪ own.

This split is worth its complexity because the two kinds of tag genuinely
differ: "Sci-Fi" is a fact about the book that the household should agree on,
while "Read before the trip" is nobody else's business.

**`BookTag` needs no `user_id`**, which is the neat part. A personal tag is
only visible to its owner, so a `BookTag` row pointing at it is only visible
to its owner too — visibility flows from `Tag.owner_id` and never has to be
restated. A global tag's assignment is likewise global.

A link table alone would still not be enough, for the same reason as in the
single-user draft: the prototype keeps `customTags`, user-created tags not
yet on any book, and the sidebar vocabulary is the union of those with tags
in use. A tag must be able to exist with zero books.

**Uniqueness** is a unique index on `(coalesce(owner_id, 0), lower(name))`,
plus a route-level rule that a personal tag **may not shadow a global one**
(`409`). Two rows both rendering as "Sci-Fi" in one sidebar is a bug from the
user's side regardless of how defensible it is in the schema.

**Tag colours are deliberately not stored.** The prototype derives the dot
colour by cycling a fixed 12-swatch palette by list index. That is
presentation, the palette is already documented in the handoff, and storing
it would invent a colour-picking feature nothing designed.

### `Note` — defined now, built in Phase 2

```python
class Note(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    book_id: int = Field(foreign_key="book.id")
    text: str
    page: int | None = None
    created_at: datetime
```

No endpoints in Phase 1. The table exists because Phase 2 builds RAG
ingestion over these same tables, and adding a notes table *then* means a
schema change at exactly the moment the vector store is being wired up.
Highlights are also unusually good retrieval material — they are the passages
a reader already decided were worth keeping.

Per-user, like everything else about reading rather than about the book.

### What stays in `book_metadata`

The sha256, `original_filename`, `size_bytes`, and the raw OPF fields with no
UI: `language`, `publisher`, `identifiers`, `subjects`, `authors`, and the
unparsed `published` string that `year` derives from. Exactly the
extensibility case the column was added for.

### OPF subjects are not tags

`dc:subject` parses into `book_metadata["subjects"]` today, and auto-promoting
those to `Tag` rows on upload is tempting. **Don't, by default** — and
multi-user strengthens the argument. Real EPUBs carry BISAC codes, publisher
taxonomy strings, and comma-jammed phrases; promoting them automatically
would fill a *shared household vocabulary* with noise nobody chose, and any
user could then delete a global tag to clean it up.

Keep subjects as provenance. An admin-run "import subjects as tags" action is
cheap to add later and impossible to undo cleanly if the default runs the
other way.

## Authentication

**Password login with server-side sessions.**

- **Hashing**: Argon2id via `argon2-cffi`. Note that `passlib`, the
  conventional FastAPI choice, has not had a release since 1.7.4 (2020) and
  imports the stdlib `crypt` module removed in Python 3.13 — verify its
  status at implementation time rather than reaching for it by habit.
- **Sessions over JWT.** A JWT's statelessness buys nothing here: there is
  one server with a SQLite database sitting right next to it, and
  statelessness costs the ability to revoke. A session table plus an httpOnly,
  SameSite=Lax cookie is revocable, invisible to JavaScript, and simpler.

  ```python
  class Session(SQLModel, table=True):
      id: str = Field(primary_key=True)          # opaque random token
      user_id: int = Field(foreign_key="user.id")
      kind: str = "browser"                      # "browser" | "device"
      expires_at: datetime
      created_at: datetime
  ```

  `kind` and `expires_at` exist now so that Phase 5's device tokens are a
  row rather than a schema change — see [Decisions](#decisions).
- Endpoints: `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`.
- A `current_user` FastAPI dependency, mirroring how `get_session` and
  `get_settings` are already injected, so tests can override it the same way
  [`tests/conftest.py`](../../backend/tests/conftest.py) already overrides
  those.
- **Bootstrap**: the first user created is admin. Seeded by a CLI command
  rather than an open registration endpoint — an ebook server that lets any
  visitor create the first admin account is a well-known way to lose a box.

**This is the constraint that makes CORS non-trivial.** Cookie auth from a
browser client requires `allow_credentials=True`, which forbids the `*`
origin — the allowed origins must be enumerated. So `cors_origins` is a real
configuration value, not a permissive default. It also means the Flutter web
client must send credentialed requests, and native Flutter (Phase 5) handles
cookies less gracefully than a browser does; see [Decisions](#decisions).

## Permissions

| Action | Owner | Other user | Admin |
|---|---|---|---|
| Read the book catalog, download, convert | ✅ | ✅ | ✅ |
| Upload a book | ✅ | ✅ | ✅ |
| Delete a book (removes the shared file) | — | — | ✅ only |
| Edit shared book metadata (title, author, year, blurb, pages) | — | — | ✅ only |
| Read/write own rating, progress, shelf placement | ✅ | ❌ | ❌ |
| Create/rename/reorder/delete own shelves | ✅ | ❌ | ❌ |
| Read a **public** shelf and its owner's progress on it | ✅ | ✅ read-only | ✅ read-only |
| Read a **private** shelf | ✅ | ❌ | ❌ |
| Create/rename/delete personal tags | ✅ | ❌ | ❌ |
| Apply/remove a personal tag on a book | ✅ | ❌ | ❌ |
| Create/rename/delete **global** tags | — | ❌ | ✅ only |
| Apply/remove a **global** tag on a book | — | ❌ | ✅ only |
| Manage users, set `is_admin` | — | ❌ | ✅ |

Two calls in that table are worth defending:

**Admin does not get to read private shelves.** Admin is a curation role over
shared things — the catalog and the global vocabulary — not a surveillance
role over household members. Making "private" mean "private except from Dad"
would make the setting worthless.

**Only admins apply global tags.** Since a global tag's assignment is global,
letting any user attach one changes what everyone sees. Restricting it keeps
the shared vocabulary curated and matches "tags from admin are shared" —
users express themselves through personal tags, which they fully control.
This is the most likely rule to want relaxing after real use; it is much
easier to loosen later than to tighten.

**Deleting a book deletes a shared file** and every user's state for it,
which is why it is admin-only even though anyone may upload. Uploading is
additive and reversible; deleting is neither.

## Migration

**This is the point where `SQLModel.metadata.create_all()` stops being
sufficient**, and it is worth stating plainly because
[format-conversion.md](format-conversion.md) explicitly relied on the
opposite being true.

`create_all()` creates missing *tables*. It does not add *columns* to an
existing one, and it does not fail loudly when it skips them — an existing
`libra.db` would keep a `book` table with no `year` column while the ORM
believes otherwise, surfacing as an `OperationalError` on first query rather
than at startup.

`User`, `Shelf`, `Tag`, `BookTag`, and `UserBookState` are new tables and are
free. The `Book` columns are not, and there is a **data migration** on top of
the schema one: existing books need an `uploaded_by`, which means the
migration has to run after at least one user exists. Backfilling to the
bootstrap admin is the only sensible answer, and it has to be written down
rather than improvised.

**Recommended: introduce Alembic with this feature.** One baseline revision
stamping the current schema, one adding the tables and columns, one
backfilling. The cost is one-time. The alternative is asking every user —
including the author, mid-diploma, with real books already uploaded — to
delete their database, which is not a migration story that survives a
committee asking how upgrades work.

*Alternative considered:* hand-rolled `ALTER TABLE` guarded by a
`PRAGMA table_info` check in `init_db()`. Cheaper today, but it is a
migration framework with one feature and no down-path, and the next schema
change would want the third. Rejected.

## API

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/auth/login` | Exchange credentials for a session cookie |
| `POST` | `/auth/logout` | Invalidate the session |
| `GET` | `/auth/me` | Current user, including `is_admin` |
| `GET` | `/users` | List users (admin) |
| `POST` | `/users` | Create a user (admin) |
| `PATCH` | `/users/{id}` | Update own profile / `kindle_email`; `is_admin` requires admin |
| `GET` | `/books` | List, with `?q=`, `?tags=`, `?shelf_id=`, `?sort=`; merges caller's state |
| `PATCH` | `/books/{id}` | Shared metadata (admin only) |
| `PUT` | `/books/{id}/state` | Caller's own `rating`, `progress`, `shelf_id`, `tag_ids` |
| `GET` | `/books/{id}/cover` | Cover image bytes, or `404` |
| `GET` | `/shelves` | Own shelves in order, plus others' public shelves |
| `POST` | `/shelves` | Create; appended at the end of the caller's order |
| `PATCH` | `/shelves/{id}` | Rename, or change `visibility` |
| `DELETE` | `/shelves/{id}` | Delete; `?reassign_to={id}` moves its books |
| `PUT` | `/shelves/order` | Bulk reorder; body is the caller's full ordered id list |
| `GET` | `/tags` | Visible vocabulary (global ∪ own) with book counts |
| `POST` | `/tags` | Create personal; `?global=true` requires admin |
| `PATCH` | `/tags/{id}` | Rename (owner, or admin for global) |
| `DELETE` | `/tags/{id}` | Delete; removes it from every book |

### `PATCH /books/{id}` splits in two

This is the clearest structural consequence of multi-user. The single-user
draft had one `PATCH` carrying both `title` and `rating`; those now have
different owners and different permissions, so they need different endpoints:

- **`PATCH /books/{id}`** — the shared catalog. Admin only.
- **`PUT /books/{id}/state`** — the caller's own row. Always permitted, never
  touches anyone else's view, and upserts the `UserBookState` row if absent.

`PUT` rather than `PATCH` on state because the design's edit form commits
every field at once on Save, and the row is small enough that a full
representation is honest. `tag_ids` supplied means **replace the caller's
personal tag set wholesale**, consistent with how `book_metadata` already
behaves; global tags are unaffected by it and are managed through the tag
endpoints.

*Alternative considered:* keeping one `PATCH` and routing fields by
permission internally. Rejected — an endpoint whose authorization depends on
which keys the body happens to contain is difficult to test exhaustively and
worse to reason about.

### `BookRead` merges the caller's state

`GET /books` and `GET /books/{id}` return the shared fields joined with the
calling user's `UserBookState`, defaulting to unrated / no progress / no
shelf when no row exists. From the client's perspective the response is
nearly the shape the design assumes — a flat book object with `rating`,
`progress`, and `shelf_id` on it — while the storage underneath is per-user.

Personal tags in the response are the caller's own; global tags appear for
everyone. Add `has_cover: bool` and `uploaded_by` while the shape is being
settled.

### Filtering semantics

The handoff fixes these and they should be copied verbatim: **tag filters OR
each other** (a book matches if it carries any one of them), and **the text
query ANDs against that result**, matching case-insensitively against title
**or** author. The prototype merges sidebar clicks and typed `#tag` tokens
into one set; that merge is the client's job, the API takes one list.

Multi-user adds one rule: **filtering by a tag id the caller cannot see is a
`404`, not an empty result.** An empty result set would confirm the tag
exists, letting a user enumerate another user's private vocabulary by id.

Build this server-side even though client-side filtering would work at
personal-library scale, because Phase 3's `search_library` agent tool wants
this exact endpoint — and, now, its exact scoping rules.

### Shelf deletion is transactional

The Manage Shelves modal asks *"Move N book(s) to 'To Read' and delete this
shelf?"* — one user decision, so one request: reassign, then delete, in one
transaction. The prototype does it client-side because it has no server; a
client issuing `DELETE` plus N state updates can fail halfway and leave books
pointing at a shelf that no longer exists, reintroducing exactly the
orphaning stable ids were added to prevent.

`?reassign_to=` omitted means those books become unshelved for that user,
which is now a valid state. The prototype's fallback of reassigning to the
first remaining shelf, or inventing "To Read", should not be reproduced — it
silently moves a user's books somewhere they did not ask for.

`reassign_to` must name another shelf **owned by the caller** (`403`
otherwise), which is the same ownership rule as `UserBookState.shelf_id` and
should share one validation helper rather than being written twice.

### Reordering is bulk

`PUT /shelves/order` takes the caller's complete ordered shelf id list and
rewrites `position` for all of them in one transaction. It matches the
modal's commit-on-Save behaviour, it is atomic, and it cannot produce the
duplicate or gapped positions that per-row PATCHes race into. Reject a list
that is not exactly the caller's current shelf set (`422`) — that catches a
stale client rather than silently dropping a shelf, and it also stops a
caller slipping another user's shelf id into the list.

### Cover art

`read_metadata()` learns to resolve the cover image and record its archive
path in `book_metadata`, so serving one does not re-parse the OPF per
request. Both EPUB generations need handling: EPUB 3 marks a manifest item
`properties="cover-image"`, EPUB 2 uses `<meta name="cover" content="{id}"/>`
pointing at a manifest item id. The href resolves relative to the OPF's
directory, not the zip root — which the existing test factory already
exercises incidentally, since its `opf_path` defaults to `OEBPS/content.opf`.

`BookRead` gains `has_cover: bool`. Without it a twelve-cell grid fires
twelve requests that 404 on first paint, and the design's gradient fallback
is a client-side render needing no round trip to decide on.

**Serving is security-sensitive**, because the bytes come from a
user-uploaded file and the API serves them from its own origin — and now
there is a session cookie on that origin to steal:

1. **Allowlist the content type** to `image/jpeg`, `image/png`, `image/gif`,
   `image/webp` from the manifest's `media-type`, rejecting anything else.
   Serving `text/html` out of a book archive is stored XSS, and with cookie
   auth it is stored XSS with a session to exfiltrate.
2. **`X-Content-Type-Options: nosniff`**, so the browser cannot overrule the
   allowlist.
3. **Size-cap the member read**, reusing `epub.py`'s existing `_read_member`
   pattern rather than writing a second one.

Add `ETag` (the sha256 plus cover path is already unique and free) and
`Cache-Control: private` — `private` specifically, since responses now vary
by authenticated user and a shared cache must not serve one household
member's request to another.

*Alternative considered:* extracting covers to files in `library_dir` at
upload. Faster per request, but it adds a second artifact class that
`DELETE /books/{id}` must clean up — a path
[format-conversion.md](format-conversion.md) already has to extend. Reading
lazily from the zip keeps one file per book on disk. Revisit if grid paint
measures slow.

## Error handling

| Condition | Response |
|---|---|
| No session, or an expired one | `401` |
| Authenticated but not permitted (see [Permissions](#permissions)) | `403` |
| Shelf or tag name already exists in that scope | `409` |
| Personal tag name shadows a global tag | `409` |
| Shelf or tag name empty or whitespace-only | `422` |
| `shelf_id` or `reassign_to` names a shelf the caller does not own | `403` |
| `reassign_to` names the shelf being deleted | `422` |
| `PUT /shelves/order` list is not exactly the caller's shelf set | `422` |
| `tag_ids` contains an id the caller cannot see | `404` — not `403`, which would confirm it exists |
| `rating` outside 0–5, `progress` outside 0–1 | `422` (Pydantic) |
| Book, shelf, or tag not found **or not visible** | `404` |
| Cover requested for a book with none | `404` |
| Cover media type outside the image allowlist | `404` — from the client's view the book has no usable cover |

The `403`-vs-`404` split follows one rule: **`403` when the caller already
knows the resource exists, `404` when telling them would be the leak.** A
shelf the caller can see but not edit is a `403`; another user's private
shelf is a `404`.

The design specifies **no error states at all** ("Loading states, error
states … have no design. Ask before inventing these") and no `401` handling
in particular, so session expiry has no designed behaviour. Documenting the
codes here at least gives the client something concrete to map once those
states exist.

## Testing strategy

Nothing here needs an external binary, so unlike format conversion this is
ordinary unit and API testing. The parts worth calling out:

- **Cross-user isolation is the test suite's centre of gravity.** For each of
  private shelves, personal tags, and reading state: user B cannot read them,
  cannot modify them, and cannot detect their existence by id. These are the
  tests that would catch a missing `WHERE user_id = ?`, which is the defining
  bug class of this whole change and is silent when it happens.
- **Public shelves are read-only.** B can read A's public shelf; B cannot
  rename it, reorder it, delete it, or change what is on it.
- **Admin is not a superuser over private data.** An admin account gets `404`
  on another user's private shelf. Worth an explicit test because it is a
  rule someone will later "fix" by accident.
- **Global vs. personal tag rules**: non-admin cannot create, rename, delete,
  or apply a global tag; a personal tag shadowing a global name is `409`.
- **Rename does not orphan.** The regression test for the bug the whole model
  exists to fix: create a shelf, put books on it, rename it, assert the books
  are still there. Same for tags. It fails against the prototype's model and
  should be written first.
- **One shelf per user per book** holds while two users have the same book on
  different shelves simultaneously.
- **A book on Mom's shelf cannot be placed by Dad** — the route-level
  ownership check that no foreign key expresses.
- **Shelf deletion is atomic**: reassignment and deletion both happen, and —
  by forcing a failure partway, in the style of the upload router's
  orphan-cleanup tests — neither happens on error.
- **Filter semantics**, table-driven over the OR/AND rules, plus the
  invisible-tag `404`.
- **Cover extraction** for both EPUB 2 and EPUB 3 declaration styles, and the
  content-type allowlist fed an EPUB whose manifest declares the cover as
  `text/html`. `epub_factory.build_epub()` gains a `cover` keyword argument,
  keeping the existing pattern where each malformed variant is one keyword
  away from the happy path.
- **Auth plumbing**: every endpoint returns `401` unauthenticated. Cheap to
  assert exhaustively via the route table, and it catches the endpoint that
  forgot the dependency.
- **Migration**: an Alembic upgrade against a database created at the current
  schema, asserting existing rows survive and `uploaded_by` backfills.

Per the project's mutation-testing convention, the guards that exist to *be*
guards get broken by hand once to confirm their tests actually fail: the
shelf-ownership check, the cover content-type allowlist, the global-tag admin
check, and every user-scoping `WHERE` clause.

## Roadmap impact

**Decided: Phase 1, with the user model early within it.** Scheduled as
milestones 1 and 3–7 in [phase-1-plan.md](phase-1-plan.md#sequence);
[architecture.md](../architecture.md) has been updated accordingly (phase
list, non-goals, and the tech-stack rows for auth and migrations).

Two reasons, one general and one specific:

- The library-organization half is backend model work, fully unit-testable
  without a UI. The alternative is discovering five schema changes and a
  migration framework during the Phase 4 client build in the last two months
  before defense.
- The multi-user half is the single most expensive thing to retrofit in the
  entire project. Every endpoint gains a `current_user` dependency, every
  query gains a scoping clause, and every existing test gains an authenticated
  client fixture. Doing it against six endpoints is an afternoon; doing it
  against thirty, after RAG and the agent are built, is a rewrite.

**Phase 2 and 3 are affected and should be re-read in this light.**
Embeddings are per-book, so the vector store stays shared and needs no
per-user duplication — that part is free. But the agent's tools are not: a
`search_library` tool that ignores user scoping will happily surface another
member's private shelves, and "recommend similar" should reason over *my*
reading history, not the household's. **The agent is a new path to every
piece of data in the system, and it needs the same scoping rules as the
REST API rather than its own.** Worth writing into the Phase 3 spec when it
is drafted — an authorization boundary that exists in one interface and not
the other is not a boundary.

Kindle delivery, still unbuilt, now targets `User.kindle_email` rather than a
single configured address.

## Design gaps affecting this spec

Raised in the handoff review, listed here because they bound what this spec
can settle:

- **The design has no concept of users at all** — no login screen, no session
  expiry state, no user switcher, no shelf visibility toggle, no indication
  of whose shelf you are looking at, no admin surface for managing users or
  the global tag vocabulary. This is now the largest gap, and it is a
  prerequisite for the Phase 4 client rather than a nice-to-have.
- **The sidebar has one flat shelf list** with nowhere to put other users'
  public shelves. Whether they appear there grouped, on the Shelves page
  only, or behind a filter is an open design question.
- **No UI exists for format conversion, downloads, or Kindle delivery** —
  two of Phase 1's own features have no surface in any of the five screens.
- **No UI exists for the librarian agent.** Phase 3's agent and Phase 4's
  "chat interface to the agent" are the project's novel contribution and the
  sidebar has no slot for them.
- **No mobile or responsive design**, stated explicitly, while Phase 5 is
  mobile.
- **No default sort for the library grid** is specified. Shelves have an
  explicit user order; books have none, so `?sort=` needs a default chosen
  here rather than inherited.

## Decisions

Resolved during Phase 1 planning; the full log, including the questions
carried from [format-conversion.md](format-conversion.md), is in
[phase-1-plan.md](phase-1-plan.md#decisions).

- **`pages`** — parse `<meta property="schema:numberOfPages">` from the OPF
  when a file declares it, since the OPF is already being read. Otherwise
  `NULL`, user-editable. **Never estimated**: an invented count presented as
  fact is worse than a blank, and it would not match the print edition anyone
  is holding. EPUB 3's `page-list` navigation document is a second, richer
  source and a candidate later enhancement — it needs a second document
  parsed, so not now. Note `pages` is *shared*, so one user's correction
  applies to everyone.
- **Notes and highlights** — model defined above and created by the
  migration, endpoints in Phase 2.
- **Session cookies and native Flutter** — cookies now; `Session.kind` and
  `expires_at` make a Phase 5 per-device token a row rather than a schema
  change.
- **`GET /books` envelope** — `{items, total}`. The design's header shows a
  count, filtering makes "total matching" the number it actually wants, and
  changing the envelope later breaks every client at once.
- **Default library sort** — `title` ascending, with `?sort=added` available
  for a library being actively filled.
- **Non-admins applying global tags** — stays admin-only. Loosening later is
  a permission change; tightening later breaks workflows people already have.
- **`started_at` / `finished_at`** — added, per the model above.
- **A deleted user's data** — `uploaded_by` nulls and the books survive,
  since a shared catalog should not lose books when a household member
  leaves. Their shelves, personal tags, reading state, sessions, and notes
  cascade. Public shelves vanish with their owner; that is the visible
  consequence, and it is accepted rather than overlooked.

### Still open

- **Is `Book.format` still meaningful** once `BookFormat` exists from
  [format-conversion.md](format-conversion.md)? Deferred with that feature,
  which has moved out of Phase 1. The cost of deferring: `BookRead` changes
  shape here and will change again there, so conversion should land before
  the Phase 4 client rather than after it.
