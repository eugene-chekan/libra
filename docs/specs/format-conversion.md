# Spec: Format Conversion

**Status:** Not started, and **deferred out of Phase 1** — scheduled after
Phase 2 (RAG), ideally before the Phase 4 client so `BookRead` settles shape
before anything consumes it. See
[phase-1-plan.md](phase-1-plan.md) for the reasoning.

**The premise below is wrong** — confirmed 2026-08-03. This spec was written
assuming Kindle delivery would build on conversion, since sending a book to a
Kindle needs a file in a Kindle-compatible format ready to attach. Send to
Kindle accepts EPUB directly, so delivery needs an SMTP client and no
conversion at all.

That removes the reason this feature was scheduled first, and it also
**changes what conversion is for**. It is no longer "make the file
Kindle-compatible"; it is "make the file readable on a device that is not a
Kindle, or sideloadable over USB." A smaller and less urgent goal — which is
why the feature moved out of Phase 1 — and one that should be revisited
against real need before it is built, rather than assumed.

The rest of the document stands as written; the design was not the problem,
the scheduling was.

## Goal

Let a user convert an uploaded book into other ebook formats, using Calibre's
`ebook-convert` CLI rather than reimplementing format conversion — consistent
with the existing project rule ("shell out, don't reimplement") already
applied to metadata extraction avoiding `ebook-meta` for the opposite reason
(speed, no CI dependency). Conversion is inherently different: there's no
stdlib alternative, `ebook-convert` genuinely has to run.

## Scope

**In scope:**
- Convert a book's stored file (currently always EPUB) to one target format
  from a small allowlist: `azw3`, `mobi`, `pdf`.
- Store the converted file alongside the original, not replacing it — a book
  can have multiple format variants at once.
- List and download the available formats for a book.
- Clean up converted files when the parent book is deleted.

**Out of scope (later, or never):**
- Batch/bulk conversion across the whole library.
- Async job queue, progress reporting, or websocket status — Phase 1 stays
  synchronous (see [Open questions](#open-questions)).
- Format-specific tuning (font embedding, output profiles, page size for
  PDF, etc.) — always call `ebook-convert` with defaults.
- Re-converting FROM non-EPUB formats — Phase 1 upload only accepts EPUB, so
  the source format is always EPUB for now.
- OCR, DRM removal.

## Data model

Today a `Book` has exactly one `file_path`/`format` pair. Conversion needs a
book to have *several* files (the original plus N converted variants), which
doesn't fit into the existing single-file model without overloading
`book_metadata` in a way that's hard to query or validate.

**Proposed:** a new `BookFormat` table:

```python
class BookFormat(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    book_id: int = Field(foreign_key="book.id")
    format: str                # "epub", "azw3", "mobi", "pdf"
    file_path: str             # relative to library_dir, same convention as Book.file_path
    size_bytes: int
    sha256: str
    source: str                # "upload" | "conversion"
    created_at: datetime
```

`Book.file_path`/`Book.format` stay as-is and continue to mean "the original
upload" — no migration of existing rows needed. On upload, a matching
`BookFormat(source="upload")` row could also be created so `Book` and
`BookFormat` don't disagree about what formats exist; needs deciding at
implementation time whether `Book`'s own fields become derived/redundant or
stay the source of truth for the original.

*Alternative considered:* a `formats: dict[str, str]` mapping inside the
existing `book_metadata` JSON column, matching how OPF-parsed fields already
live there. Rejected as the primary model because format rows want their own
identity (size, hash, deletion, "when was this converted") — cramming that
into a loosely-typed JSON blob undermines the querying and validation a real
table gives for free, and this is exactly the kind of structural data
`book_metadata` was *not* meant to hold (see the model's own docstring
reasoning). No migration tooling (Alembic) exists yet since this is Phase 1
`SQLModel.metadata.create_all()` — a new table is free right now; that won't
stay true forever, but is out of scope for this feature.

## API

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/books/{id}/convert` | Convert to a target format; body `{"target_format": "azw3"}` |
| `GET` | `/books/{id}/formats` | List a book's available format variants |
| `GET` | `/books/{id}/formats/{format}/download` | Download a specific format's file |

`POST /books/{id}/convert` runs synchronously and returns the new
`BookFormat` row (or `200` with the existing row if that format was already
converted — conversion should be idempotent, not re-run needlessly).

## Conversion pipeline

Mirrors the upload pipeline's ordering discipline (stage → validate → commit,
never leave a partial artifact):

1. Validate `target_format` against the allowlist (`422` otherwise) —
   **never pass a client-supplied string straight into the `ebook-convert`
   argv**, even though it's argv and not a shell string; an allowlist is the
   difference between accepting `azw3` and accepting `--exec=...` or an
   arbitrary output path.
2. If a `BookFormat` for that book+format already exists, return it — no-op.
3. Resolve the source file via `storage.resolve()` (reusing the existing
   traversal guard, not a new one).
4. Run `ebook-convert <source> <staged-output>` as a subprocess:
   - **Always `subprocess.run([...])` with a list, never `shell=True`.**
   - Enforce a timeout (needs a concrete number — see open questions).
   - Capture stdout/stderr for diagnostics, but don't leak raw Calibre
     output back to the client — a `500` with a generic message plus
     server-side logging.
   - Stage the output the same way `storage.stage_upload()` stages an
     upload: write to a temp path inside `library_dir`, only `commit()` it
     to a permanent name after `ebook-convert` exits `0` **and** the output
     file exists and is non-empty (a `0` exit code alone isn't proof of a
     usable file).
5. Hash and size the committed output the same way uploads do; insert the
   `BookFormat` row.
6. If the DB insert fails, delete the just-committed file — same
   never-orphan invariant the upload endpoint already follows.

`DELETE /books/{id}` needs extending to also delete every `BookFormat`'s file,
not just `Book.file_path`.

## Error handling

| Condition | Response |
|---|---|
| `target_format` not in the allowlist | `422` |
| Book not found | `404` |
| `ebook-convert` not on `PATH` | `503` — distinct from a conversion failure, since it means the *deployment* is missing a dependency, not that this book is bad |
| `ebook-convert` exits non-zero, or times out, or produces an empty/missing file | `500`, generic message; details server-side only |
| Format already converted | `200` with the existing `BookFormat`, not a new conversion |

## Testing strategy

This is the open design tension for this feature, worth resolving before
writing code rather than during. Format conversion has no stdlib fallback —
unlike EPUB metadata parsing, there's no way to unit-test the *actual*
conversion without Calibre physically present. Two layers seem right:

1. **Always-run unit tests** that don't need real Calibre: allowlist
   rejection, "already converted" idempotency, `404` handling, orphan
   cleanup on DB failure — all achievable by monkeypatching the subprocess
   call (assert it was invoked with the expected argv; simulate non-zero
   exit, timeout, and empty-output-file cases without ever shelling out).
2. **A smaller set of real-Calibre integration tests**, skipped when
   `ebook-convert` isn't discoverable on `PATH` (`shutil.which`), so they run
   locally (Calibre is already installed on the dev machine) but don't block
   CI unless CI also gets Calibre installed.

Whether to install Calibre in CI at all is an open question below — it's a
large, slow dependency for a GitHub Actions runner, and the project already
made the opposite call for metadata parsing specifically to avoid this.

## Open questions

Resolved during Phase 1 planning ([phase-1-plan.md](phase-1-plan.md)):

- **Sync vs. async conversion.** **Decided: build synchronous, measure, then
  revisit.** `ebook-convert` can be slow for large or image-heavy books, but
  a job queue, worker, and status-polling endpoints are real scope to add
  against a guess. Measure real conversion times on representative books
  first; only go async if the numbers demand it.
- **Timeout value.** **Decided: 120s as a starting point**, to be validated
  by that same measurement rather than shipped as a guess.
- **Install Calibre in CI or not?** **Decided: yes, but in a separate
  non-blocking job**, so the fast lint/test lane stays fast while real
  integration coverage still exists. The skip-if-absent tests from
  [Testing strategy](#testing-strategy) run in both lanes.

Still open:

- **Does `Book`'s own `file_path`/`format` become redundant with
  `BookFormat`,** or stay the source of truth for "the original" while
  `BookFormat` covers everything including the original? Affects whether
  existing endpoints need to change shape. Deferred with the feature — but
  note that deferral has a cost: `BookRead` is changing shape in Phase 1 for
  library organization and will change again here, so this should land before
  the Phase 4 client rather than after.
- **Supported format allowlist** — `mobi` is out: Amazon no longer accepts
  it, and it was only ever on the list to serve Kindle delivery, which turns
  out not to need conversion. That leaves `azw3` (Kindle-native, for USB
  sideloading) and `pdf` (universal). Both now need justifying against a real
  use case before this is built, since the feature's original purpose
  dissolved — see the status note.
