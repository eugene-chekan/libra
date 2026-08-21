# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

libra is a local-first, self-hosted personal ebook library manager (simpler
in scope than Calibre-web, aimed at Kindle users) with a planned RAG-backed
AI "librarian" agent. It's also a Bachelor's diploma project with a 6-month
build window, so code quality, structure, and testability are treated as
first-class concerns — this needs to hold up to committee scrutiny, not just
"work on my machine."

**Phase 1 (backend core)** is done bar format conversion, and **Phase 4 (the
web client)** is underway — it was deliberately reordered ahead of RAG and the
agent, see `docs/specs/phase-4-plan.md` for why. **The client moved from
Flutter to TypeScript and React on 2026-08-21**, because Flutter's web build
paints the page onto a single canvas instead of building real page elements —
see `docs/specs/client-stack.md` for the reasons, the cost, and the new
stack. See
`docs/architecture.md` for the full 5-phase roadmap and `docs/evaluation.md`
for how each phase's evaluation methodology is meant to be built alongside the
implementation, not retrofitted after.

## How to write here

Use the simplest English possible, at all times. This applies everywhere:
chat replies, commit messages, PR descriptions, specs, docs, and code
comments.

The reader is not a native English speaker, and is a beginner in web and
mobile development. Write for that reader.

- Short sentences. One idea in each sentence.
- Plain words. No idioms and no figures of speech.
- Explain a web, browser, or mobile term in one short line the first time it
  appears. Do not assume knowledge of React, CSS, the DOM, HTTP, or build
  tools.
- **Python and backend work is the exception.** That ground is familiar, so
  normal terms are fine there. Keep the sentences short anyway.
- Simple does not mean vague. Keep every exact file name, line number,
  command, and measurement. Cut the hard words, never the facts.

The specs in `docs/` were written before this rule and are dense. Simplify a
section when a change touches it, rather than in one large pass.

## Commands

### Running the whole thing

```bash
scripts/run.sh            # build client + wheel, migrate, serve on 0.0.0.0:8000
scripts/run.sh --skip-web # reuse the last client build (skips ~30s)
scripts/run.sh --scratch  # throwaway instance, wiped on every run
PORT=9000 scripts/run.sh
```

**Use `--scratch` for anything exploratory** — demoing, verifying a change,
clicking through a new screen, seeding fake books. It keeps its data in
`.run/scratch/` and empties that on every run, so a clean slate never requires
deleting anything. `.run/data/` is somebody's real installation: their account,
their books. Nothing that tests the app should be able to damage it, and a
plain `scripts/run.sh` during a test is how that happens.

**One process, one origin.** The API serves the built client at `/`, so both
share an address. That is not tidiness: the client resolves its API address
from the page it was loaded from (`Uri.base.origin`), which is what lets any
device on the network open `http://<host>:8000` and work. Served separately,
the client would need rebuilding for every address it might be reached at, and
every device's origin adding to `LIBRA_CORS_ORIGINS`.

The script installs the wheel into a throwaway venv at `.run/` and runs *that*,
not the source tree — so anything missing from the wheel fails here rather than
on someone else's machine. Data lives in `.run/data/`, untouched by rebuilds.
It is idempotent: safe on every boot, and it creates an admin only when the
installation has no users at all.

The script ends in `exec uvicorn`, so **uvicorn replaces the shell** — killing
the job that launched it leaves the server running and the port held. Stop it
by port, not by job. `LIBRA_ADMIN_PASSWORD` seeds the admin non-interactively,
which is what makes a scratch instance scriptable.

The split two-origin setup is still what `flutter run` gives you, and still
needs `LIBRA_CORS_ORIGINS`; see `client/README.md`.

### Backend

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

### Client

All commands run from `web/`. TypeScript, React and Vite — the Flutter client
was deleted on 2026-08-21, see `docs/specs/client-stack.md`.

```bash
npm ci                # install exactly what the lockfile says
npm run dev           # run against a backend on localhost:8000
npm test              # component tests (Vitest)
npm run e2e           # end-to-end tests in a real browser (Playwright)
npm run lint          # ESLint, including the accessibility rules
npm run typecheck     # tsc --noEmit
npm run format        # Prettier, writing
npm run build         # typecheck, then a production build into dist/
```

CI runs `npm run format:check`, so format before pushing or the client job
fails on whitespace. `npm run e2e` needs a browser once:
`npx playwright install chromium`.

**`npm run dev` proxies `/api` to localhost:8000**, so the browser sees one
origin and `LIBRA_CORS_ORIGINS` is not needed for ordinary development. It is
only needed if you bypass the proxy and call the backend directly:

`LIBRA_CORS_ORIGINS='["http://localhost:<client-port>"]'` on the backend. It
is empty by default, credentialed requests cannot use a `*` origin, and a
blocked preflight reaches the client as an indistinguishable network failure —
so a misconfigured origin looks exactly like a server that is not running.

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

- **One feature per branch**, branched from `main`. Open the PR once the
  feature is complete — pushed, suite green — rather than waiting to be
  asked. Keep PR descriptions short: what the feature does, which files
  changed, and anything a reviewer must know. The detailed reasoning belongs
  in the commit message and in `docs/specs/`, which already carry it.
- Docs and planning changes (specs, plans, README, architecture) go straight
  to `main`. Branches are for code.
- `gh` CLI is installed and authenticated — use it for PR creation and reading
  CI status/logs rather than the GitHub web UI or scraping the REST API.
- [Conventional commits](https://www.conventionalcommits.org/) (`feat:`,
  `fix:`, `chore:`, `docs:`, `test:`).
- Squash-merge is the default merge method for this repo (single logical
  commit per PR keeps `main` linear and readable for committee review); switch
  to rebase-merge only for a PR with deliberately atomic multi-commit history.

## Code style and architecture rules

Written against the Flutter client. The rules are about the defects, not the
framework, so they carry over to the TypeScript client — "widget" reads as
"component", and the a11y rule is now enforced by `eslint-plugin-jsx-a11y` in
CI rather than only by reading. The last rule in the list is what ended
Flutter here; see [`docs/specs/client-stack.md`](docs/specs/client-stack.md).

Full reasoning, with the defect behind each rule, in
[`docs/specs/code-style.md`](docs/specs/code-style.md). Every one of those
defects passed lint, format and CI — none of this is enforceable
automatically, so it has to be read.

- **One decision, one place.** Duplicated policy drifts; move it up, not
  sideways.
- **Check the SDK before writing a helper** — the codebase hand-rolled
  `firstOrNull` beside the real one.
- **Tests import constants, never transcribe them.** A copied duration had
  already drifted 2600 vs 2500ms.
- **A comment is a claim.** Two comments here described behaviour the code
  did not have. Comments above changed code are part of the diff.
- **A placeholder names a live issue and dies when it ships** — closing an
  issue includes grepping for its number.
- **A widget reads what it uses**; don't thread dependencies through a parent
  that only forwards them.
- **Never key a widget by state its own output changes** — it discards the
  `State` and makes `didUpdateWidget` unreachable.
- **The fake enforces the server's rules, including surprising ones.** A fake
  that shares the client's misunderstanding tests nothing.
- **Every widget gets at least one test.** Both bugs found in the #28 review
  were in code the suite never touched — start any review by listing what has
  no coverage.
- **Assert what is on screen, not that nothing threw.**
- **Probe before you fix**: a throwaway test that *prints* actual behaviour,
  deleted once the real test exists.
- **Verify a11y claims against a running build** — `flutter test` reads the
  framework's semantics, not the rendered DOM, and the two disagree here.

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
