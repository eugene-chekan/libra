# Spec: Setting a Book's Cover

**Status:** Designed 2026-09-07, not started. Issue #84, plus setting a cover
from a link, added when the feature was scoped.

## Why

A book's cover today comes only from what the EPUB itself declares —
`app/epub.py` finds it, and `COVER_MEDIA_TYPES` in `app/models.py` decides
whether it counts. When the file declares no cover, or declares one in a
format outside that list, `has_cover` is `false` forever. The book shows the
generated gradient placeholder and there is no way to give it a real picture.

A second report looked separate at first and is the same bug. The detail
screen's click-to-enlarge only works when `has_cover` is true
(`DetailCover.tsx`), so those books are not clickable. A placeholder has
nothing real to enlarge into. Once a cover can be set, both reports close.

## Who can do this

**Admin only, to begin with.** A cover is shared: it changes what every reader
sees, which is the same reason title, author, year and blurb sit behind
`PATCH /api/books/{id}` and its `require_admin`. A personal tag is private to
one reader and is therefore not gated; a cover is not like a personal tag.

**Later, an admin can grant it to others.** That mechanism does not exist yet —
it is issue #109, per-user permissions, with #110 for where the controls live.
This spec builds nothing towards it beyond keeping the two write paths
separate, so that "may set a cover" and "may set one from a link" can become
two different permissions rather than one.

Keeping them separable matters because they carry different risk. Uploading a
file makes the server read bytes the caller already had. Fetching a link makes
the server open a connection to an address the caller chose, which is a
different thing to hand out.

## Where the control lives

**Inside the Edit Book form**, as a section of it, next to the fields that are
already shared catalog data. The form is admin-only and so is this.

This is the opposite of the choice gap 8 made for tags, and deliberately.
There the control moved out of the form because personal tags are not
admin-only and the form is. A cover is admin-only, so it belongs where the
other admin-only fields are.

### When a cover write commits

The Edit Book form promises Save and Cancel. A cover does not fit that promise
cleanly: it is a file or a link, it goes to its own endpoint, and it cannot be
folded into the one `PATCH` the Save button sends.

**Decided: the cover commits as soon as it is chosen**, with a line of feedback
beside the control saying what happened — the same shape the tag manager uses
(it commits per row rather than batching) and the maintenance tab uses (every
action says what it did, beside the control that did it).

The cost is real and worth stating: somebody who sets a cover and then presses
Cancel will find the cover changed anyway. Two things soften it. The section
says plainly that it applies at once, and "Use the book's own cover again" is
an undo that is always available.

The alternative is to hold the chosen file in memory and send it when Save is
pressed. That keeps the promise, but it turns Save into two writes that can
half-fail — the text fields saved, the cover rejected — and there is no good
sentence to show a reader when that happens.

## What a cover write does

Four operations. Three are new.

| Method | Path | |
|---|---|---|
| `PUT` | `/api/books/{id}/cover` | Upload a file. Admin only. |
| `POST` | `/api/books/{id}/cover/from-url` | Fetch a link. Admin only. |
| `DELETE` | `/api/books/{id}/cover` | Drop the custom one. Admin only. |
| `GET` | `/api/books/{id}/cover` | Unchanged path; now prefers the custom cover. |

Two endpoints rather than one that accepts either shape: a single path taking
both a file upload and a JSON body is awkward to describe in OpenAPI, and the
two will need separate permissions later anyway.

## A custom cover shadows the EPUB's, it does not replace it

Issue #84 asked this to be decided first, because it changes what has to be
stored. The answer is to keep both.

`cover_href` and `cover_media_type` in `book_metadata` are never overwritten.
Two new keys sit beside them:

- `custom_cover_path` — the stored file, relative to the library directory.
- `custom_cover_media_type` — what it is, decided from the bytes.

`library.cover_for` then resolves in order: the custom cover, then the EPUB's
declared one, then `NoCoverError`. `has_cover` is true when either exists.

Keeping the original costs nothing, because it is already in the same JSON
blob and nothing has to move. `DELETE` removes the file and the two keys, and
the EPUB's own cover comes back on its own.

**No migration.** `book_metadata` is a JSON column, so new keys need no schema
change.

## Where the file goes, and a trap it avoids

`{library_dir}/covers/{uuid}.{ext}` — one level down, not beside the books.

The subdirectory is not tidiness. `maintenance._library_files` lists every file
sitting **directly** in the library directory, and `maintenance.report` calls
any of them that no book row points at an orphan. The Maintenance tab then
offers to delete it. A cover stored in the root would be listed as loose on
disk, and deleting it would quietly break the book it belonged to.

`_library_files` says "Flat by construction: `storage.commit` writes
`{uuid}.epub` into the root and never makes a subdirectory, so there is no tree
to walk." That sentence stops being true, so it changes in the same commit.

What this gives up: a cover file left behind by a failed write is never
reported by anything. That is a smaller problem than deleting live covers, and
it is its own issue if it ever matters.

*Considered and rejected:* keeping covers in the root and adding their names to
the report's `stored_names`. One directory is simpler, but "what counts as an
orphan" then depends on two sources, and every future kind of file has to
remember to register itself or be offered for deletion.

`delete_book` removes the custom cover along with the EPUB, for the same reason
it removes the EPUB.

## Fetching a link safely

Its own module, `app/covers_from_url.py`, kept apart the way `storage.py` is
filesystem mechanics and `epub.py` is archive parsing.

Fetching an address somebody typed is server-side request forgery if it is done
naively: the server sits inside a home network and can reach things the person
asking cannot. `http://192.168.1.1` is a router's admin page.
`http://localhost:8000` is this application. On a rented server,
`http://169.254.169.254` is the hosting account's credentials.

The rules, all of them enforced:

- **`https` only.** Plain `http` is refused. An internal address is exactly
  what would be reached over `http`.
- **The name is resolved first, and the address is checked.** If any resolved
  IP is private, loopback, link-local, multicast, reserved or unspecified, the
  request is refused before any connection is made. Python's `ipaddress`
  answers every one of those.
- **Redirects are followed by hand**, up to a small limit, re-running that
  check on every hop. A permitted host redirecting to `192.168.1.1` is the
  obvious way past a check that only looks at what was typed.
- **The body is streamed against a ceiling** — `max_cover_bytes`, already
  10 MB — so a very large response cannot be read into memory.
- **There is a timeout.** A server that accepts a connection and never answers
  must not be able to hold a worker.
- **The bytes decide the format, not the `Content-Type` header.** A server
  claiming `image/jpeg` while sending HTML is not believed.
- No cookies and no authorization headers are ever sent.

### What this does not close

Checking the name and then fetching it leaves a narrow gap: the address a name
points at can change between the check and the connection. Closing it properly
means pinning the connection to the address that was checked, which every HTTP
client makes awkward.

For an admin-only control on a household instance this is judged proportionate.
It is written down rather than left implied, because the guard reads airtight
and is not.

**Dependency:** `httpx2` moves from the dev group to the runtime dependencies.
No new library — it is already there for `starlette.testclient`.

## Formats and limits

`COVER_MEDIA_TYPES` — jpeg, png, gif and webp — for both the upload and the
link, and `max_cover_bytes` for both sizes.

The request that started this asked for jpeg only on the link path. Widened on
purpose: that list is already what `cover_for` serves and what `has_cover`
tests, and anything narrower means a PNG that can be uploaded but not linked,
which is hard to explain to the person it refuses.

The format is decided by reading the first bytes of the file in both cases. An
uploaded file's `Content-Type` is supplied by the browser and a fetched one by
a stranger's server; neither is evidence.

`GET /api/books/{id}/cover` keeps `X-Content-Type-Options: nosniff`. It matters
more now, not less: the bytes are no longer only from an EPUB the reader chose.

The response sends `Cache-Control: private, no-cache`. That does not mean "do
not store it". It means "store it, but ask the server before using it again".
The browser then revalidates with the ETag: an unchanged cover comes back as a
bodyless `304`, a replaced one as a fresh `200` at once. `max-age=86400` was
here first and was wrong: it lets a stale cover stand for a day, because the
ETag — which moves on every write, each storing a new `{uuid}` filename — is
only ever read on the revalidation that `max-age` suppresses.

## Scope

**In scope:**
- The three write endpoints, admin-only.
- Storage under `covers/`, and `delete_book` clearing it.
- `library.cover_for` resolving the custom cover first, and the `has_cover`
  that `library._merge` computes turning true when either cover exists.
- The cover section inside the Edit Book form, with its feedback line.
- `FakeLibraApi` enforcing the same rules, refusals included.
- Tests, including one for every address range the fetch guard refuses.

**Out of scope:**
- Granting either operation to a non-admin. That is #109, and this spec only
  keeps the two paths separable so it stays possible.
- Cropping, resizing or any editing of the picture.
- Reporting an orphaned cover file in the Maintenance tab.
- Fetching over plain `http`, and any allowance for an address inside the
  local network.

## Testing

- **Endpoint tests** per path: upload, link, delete, and the revert to the
  EPUB's own cover afterwards. Both refusals for a non-admin.
- **Fetch guard unit tests**: every refused range on its own, a redirect from
  a permitted host into a refused one, a body over the ceiling, a lying
  `Content-Type`, a timeout, and plain `http`. These are the tests that matter
  most in this spec, because nothing else fails loudly when they are wrong.
- **Component tests** for the cover section, its feedback line and its errors.
- **Fake** enforces the same refusals, so the component suite meets them.
- **One e2e**: set a cover on a real instance, watch `has_cover` turn true and
  the enlarge lightbox unlock — which is the second report in #84 closing.
- Every guard mutation-tested by hand, per the house rule.
