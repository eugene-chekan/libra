# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

libra is a local-first, self-hosted personal ebook library manager (simpler
in scope than Calibre-web, aimed at Kindle users) with a planned RAG-backed
AI "librarian" agent. It's also a Bachelor's diploma project with a 6-month
build window, so code quality, structure, and testability are treated as
first-class concerns — this needs to hold up to committee scrutiny, not just
"work on my machine."

Only **Phase 1 (backend core)** is underway; see `docs/architecture.md` for
the full 5-phase roadmap (RAG → librarian agent → Flutter web client →
desktop/mobile) and `docs/evaluation.md` for how each phase's evaluation
methodology is meant to be built alongside the implementation, not
retrofitted after.

## Commands

All commands run from `backend/`.

```bash
uv sync --all-groups              # install deps (creates backend/.venv)
uv run uvicorn app.main:app --reload   # run the dev server (localhost:8000, docs at /docs)
uv run pytest                     # run the full test suite
uv run pytest tests/test_upload.py::test_upload_creates_book_from_parsed_metadata  # single test
uv run ruff check .                # lint
uv run ruff check --fix .          # lint, autofixing what's fixable
uv run ruff format .               # format
```

Docker: `docker compose -f scripts/docker-compose.yml up --build` (from repo root).

### Git hooks

A pre-commit config (`.pre-commit-config.yaml`, repo root) mirrors CI locally:
ruff check/format + hygiene checks run on every commit; the full pytest suite
runs on every push, so a broken branch never reaches the remote. One-time
setup: `uv tool install pre-commit && pre-commit install --hook-type
pre-commit --hook-type pre-push`. Run everything on demand with `pre-commit
run --all-files`.

**CI only triggers on pushes to `main` and PRs targeting `main`** — a feature
branch gets zero CI feedback until its PR is opened, which makes the local
pre-push pytest gate the only safety net on a branch. Run tests locally
before pushing rather than relying on CI to catch a broken branch.

## Workflow conventions

- **One feature per branch**, branched from `main`. Open PRs only when
  explicitly asked, not automatically after pushing.
- `gh` CLI is installed and authenticated — use it for PR creation and reading
  CI status/logs rather than the GitHub web UI or scraping the REST API.
- [Conventional commits](https://www.conventionalcommits.org/) (`feat:`,
  `fix:`, `chore:`, `docs:`, `test:`).
- Squash-merge is the default merge method for this repo (single logical
  commit per PR keeps `main` linear and readable for committee review); switch
  to rebase-merge only for a PR with deliberately atomic multi-commit history.

## Architecture

### Settings and the lazy engine (`app/config.py`, `app/db.py`)

`Settings` (pydantic-settings, `LIBRA_` env prefix) is read via a cached
`get_settings()`. The SQLAlchemy engine is built lazily in `get_engine()`
(also `lru_cache`d) rather than at import time — this matters because a
module-level engine would resolve real settings (and create a real
`libra.db`) as soon as anything imported `app.db`, before tests get a chance
to override settings. Tests override both `get_settings` and `get_session`
as FastAPI dependencies (see `tests/conftest.py`), plus a session-scoped
autouse fixture that points the *process-wide* settings at a temp dir (via
env vars + cache-clearing) so `app.main`'s `lifespan` — which calls
`init_db()` against the real engine on startup — never touches the repo.

### Upload pipeline (`app/routers/books.py`, `app/epub.py`, `app/storage.py`)

`POST /books/upload` is the primary ingestion path: it takes only the file
and derives the book record from it, rather than asking the caller to
describe a book the server can read for itself. The three modules split
cleanly by responsibility:

- **`app/storage.py`** — filesystem mechanics only, no knowledge of books or
  HTTP. `stage_upload()` streams to a temp file inside the library dir
  (same-filesystem, so commit is a rename not a copy), counting bytes against
  the configured ceiling and hashing as it goes — bytes are counted on the
  stream, never trusted from `Content-Length`. `commit()` promotes to a
  generated UUID filename. `resolve()` is the **single chokepoint** that
  rejects any relative path escaping `library_dir`; this matters because
  `POST /books` (the manual-metadata endpoint) still accepts a
  caller-supplied `file_path`, so it's the thing standing between that field
  and arbitrary file access.
- **`app/epub.py`** — EPUB structural validation and OPF metadata parsing via
  stdlib `zipfile` + `ElementTree`, deliberately *not* Calibre's `ebook-meta`
  (shelling out per upload is slower and would make the test suite depend on
  Calibre being installed in CI). Strict about structure (bad zip, missing
  `container.xml`/OPF, doctype/entity declarations — rejected to close off
  billion-laughs-style expansion — all raise `InvalidEpubError`), lenient
  about content (missing `dc:title` falls back to the filename, missing
  `dc:creator` to `"Unknown"` — real-world libraries are full of imperfectly
  tagged files).
- **`app/routers/books.py`** — orchestrates the two in a fixed order: *stage
  → validate → parse → commit → insert*. A malformed upload never lands in
  the library (rejected before `commit()`), and a failed DB insert deletes
  the just-committed file rather than orphaning it. `DELETE` removes the row
  first, file second (a failed unlink leaves a stray file, never a listed but
  unreadable book). `PATCH` can correct title/author/format/`book_metadata`
  but never `file_path` — metadata is user-owned, file locations are
  storage-owned.

A `sha256` of every uploaded file lands in `book_metadata`, computed for free
while streaming, so a later phase can tell whether a file's already been
ingested into the vector store without re-reading it.

### Data model (`app/models.py`)

`Book` is a `SQLModel` table with `title`, `author`, `format`, `file_path`
(relative to `library_dir`, never absolute — so the library can be remounted
without rewriting rows), and a free-form `book_metadata` JSON column for
extensibility (series, tags, ISBN, parsed OPF fields, upload provenance)
without schema migrations per new field. `BookCreate`/`BookRead`/`BookUpdate`
are separate SQLModel classes rather than one model with optional fields —
`BookUpdate` in particular is hand-defined (not derived from `BookBase`)
specifically to omit `file_path` from what a client can set.

### Test fixtures (`tests/conftest.py`, `tests/epub_factory.py`)

`epub_factory.build_epub()` generates minimal-but-spec-valid EPUBs
programmatically (rather than committing binary fixtures) so malformed
variants — bad mimetype, missing container, no metadata, entity-bomb OPF —
are each one keyword argument away from the happy path. Tests that need to
prove a guard is real (e.g. the path-traversal check in `storage.resolve()`)
are expected to be mutation-tested by hand when written: temporarily break
the guard, confirm the test fails, then restore it — a passing test alone
doesn't prove it exercises the code path.

### Phase boundaries worth respecting

`rag/` and `agent/` exist as empty placeholder packages for Phase 2/3 — don't
build ahead of the current phase's scope. Calibre-backed format conversion
and Kindle email delivery are the remaining *Phase 1* items (not yet built);
RAG ingestion, the vector store, and the librarian agent are Phase 2/3.
