# libra — Architecture

## Vision

A local-first, self-hosted personal ebook library manager, simpler in scope
than Calibre-web, built specifically around Kindle delivery workflows,
supporting EPUB in the first iteration, with a RAG-backed AI "librarian"
agent that can answer questions about and across the user's library.

## Phased scope

**Phase 1 — Backend core (diploma months 1–2)**
- FastAPI app, book metadata CRUD, local file storage, SQLite persistence
- Format conversion via Calibre's `ebook-convert` CLI (shell out, don't reimplement)
- Kindle delivery: email-based "Send to Kindle" integration

**Phase 2 — RAG (diploma months 2–4)**
- EPUB/text ingestion and chunking pipeline
- Vector store (Chroma, local-first) + embedding model
- Retrieval endpoint, integrated with book metadata
- Evaluation: constructed QA benchmark per book (retrieval precision/recall@k)

**Phase 3 — Librarian agent (diploma months 4–5)**
- Anthropic SDK agent with tools: `search_library`, `get_book_metadata`,
  `answer_about_book` (RAG-backed), `recommend_similar`
- Evaluation: task success rate on a defined scenario set

**Phase 4 — Web client (diploma months 5–6)**
- Flutter web client: library browsing, search, chat interface to the agent
- This is the client shown at defense

**Phase 5 — Desktop/mobile (post-diploma, own pace)**
- Same Flutter codebase, additional build targets
- Local file-system integration for desktop imports

## Non-goals for diploma window

- Multi-user support / auth beyond a single local user
- Full DRM handling (explicitly out of scope, not silently ignored)
- Desktop/mobile builds
- Autonomous multi-step agent planning — the agent stays tool-calling, not
  open-ended planning/execution

## Evaluation methodology

Built alongside each phase, not retrofitted afterward — see
[evaluation.md](evaluation.md) for the live benchmark definitions.

- **RAG**: hand-built QA pairs per ingested book, measuring retrieval
  precision/recall@k
- **Agent**: a scenario set (e.g. "find a book matching this vague
  description", "summarize themes in book X") with pass/fail or graded
  scoring

## Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Backend | FastAPI (Python 3.12+) | async, good for RAG/agent endpoints |
| Persistence | SQLite → Postgres if needed | start simple |
| Format conversion | Calibre `ebook-convert` CLI | don't reimplement |
| Vector store | Chroma | local-first, low ops overhead |
| Embeddings | TBD (evaluate local vs API-based) | decide in Phase 2 |
| Agent | Anthropic SDK, tool use | keep tool set small initially |
| Client | Flutter (web target first) | desktop/mobile later, same codebase |
| CI | GitHub Actions | lint + test on push |

## Phase 1 implementation notes

- **Persistence**: SQLite via SQLModel (SQLAlchemy + Pydantic). Chosen over
  Postgres for zero-ops local-first setup; the SQLModel abstraction keeps a
  future Postgres migration to a one-line `database_url` change plus a
  driver swap.
- **Book metadata**: modeled as `title`, `author`, `format`, `file_path`, and
  a free-form `book_metadata` JSON column for extensibility (series, tags,
  ISBN, etc.) without schema churn every time a new field is needed.
- **Dependency management**: `uv` + `pyproject.toml`, dev dependencies
  (`pytest`, `httpx`, `ruff`) split into a `dev` dependency group so
  production images stay lean.

### Upload and metadata extraction

`POST /books/upload` takes the file alone and derives the book record from it,
rather than asking the caller to describe a book it can read for itself.

**Pipeline order** — stage to a temp file, validate, parse, *then* commit:

1. Reject a non-`.epub` extension early (`415`).
2. Stream the body to a temp file inside the library directory, counting bytes
   against `max_upload_bytes` and hashing as we go. Byte counting is done on
   the stream rather than trusting `Content-Length`, which the client controls.
3. Validate the EPUB structure and parse the OPF (`422` on failure).
4. Promote the temp file to its permanent name via an atomic rename.
5. Insert the row; on failure, delete the file so no orphan is left.

A malformed upload therefore never lands in the library, and a failed insert
never leaves a file with no row pointing at it.

**Metadata parsing** uses stdlib `zipfile` + `ElementTree` against the OPF
package document, deliberately *not* Calibre's `ebook-meta`, even though
`ebook-convert` remains the choice for format conversion. Shelling out per
upload is slower and would make the test suite depend on Calibre being
installed in CI, whereas the OPF is XML at a location the EPUB spec pins down.

Parsing is lenient about *content* and strict about *structure*: a book with
no `dc:title` falls back to the filename and a missing `dc:creator` to
`"Unknown"`, because real libraries are full of imperfectly tagged files.
A broken container or unparseable OPF is still a hard `422`.

**Untrusted XML**: `ElementTree` expands internal DTD entities, so a doctype
or entity declaration in `container.xml` or the OPF is rejected outright.
Neither file uses one in practice, which closes off billion-laughs style
expansion without adding a third-party parser. Zip member reads are also
size-capped against a member that claims to be small and expands hugely.

**Storage layout**: files are stored flat in `library_dir` under generated
UUID names (`{uuid4hex}.epub`), never the client-supplied filename — that
sidesteps path traversal, collisions, and cross-platform unicode/case oddities
in one move. The original name is kept in `book_metadata` for display only.
`Book.file_path` holds the name *relative* to `library_dir` so the library can
be remounted at a different absolute path (local vs. Docker volume) without
rewriting rows. `storage.resolve()` is the single chokepoint that rejects any
path escaping the library, which matters because `POST /books` still accepts a
caller-supplied `file_path`.

A `sha256` of every uploaded file is recorded in `book_metadata`. It is free
to compute while streaming and gives Phase 2 a way to tell whether a file has
already been ingested into the vector store without re-reading it.

**Metadata ownership**: `PATCH /books/{id}` can edit title, author, format,
and the metadata dict, but deliberately not `file_path` — the user owns the
metadata, the storage layer owns file locations. `DELETE` removes the row
first and the file second, so a failed unlink leaves a stray file rather than
a listed book that cannot be opened.

**Still deferred**: Calibre-backed format conversion and Kindle email delivery
are the remaining Phase 1 items; both now have real files to operate on.
