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
agent, see `docs/specs/phase-4-plan.md` for why. The client is TypeScript and
React. See `docs/architecture.md` for the full 5-phase roadmap and
`docs/evaluation.md` for how each phase's evaluation methodology is built
alongside the implementation.

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

`scripts/run.ps1` is the same thing for PowerShell 7+, with native switches
instead of flags — same steps, same output, same data directories, so the two
can be used interchangeably on one machine. **They are twins, and twins
drift**: a change to either belongs in both, in the same commit.

```powershell
scripts\run.ps1                    # build client + wheel, migrate, serve
scripts\run.ps1 -SkipWeb           # reuse the last client build
scripts\run.ps1 -Scratch           # throwaway instance, wiped on every run
scripts\run.ps1 -Port 9000         # $env:PORT is the default
```

**Use `--scratch`/`-Scratch` for anything exploratory** — demoing, verifying
a change, clicking through a new screen, seeding fake books. `.run/data/` is
somebody's real installation: their account, their books. Nothing that tests
the app should be able to damage it.

The script installs the wheel into a throwaway venv at `.run/` and runs
*that*, not the source tree — so anything missing from the wheel fails here
rather than on someone else's machine. It is idempotent, and creates an admin
only when the installation has no users at all. `LIBRA_ADMIN_PASSWORD` seeds
that admin non-interactively, which is what makes a scratch instance
scriptable.

`run.sh` ends in `exec uvicorn`, so uvicorn replaces the shell — stop it by
port, not by killing the launching job. `run.ps1` has no `exec`, so Ctrl-C
reaches uvicorn normally.

For the split two-origin setup, `npm run dev` proxies `/api` to
localhost:8000, so `LIBRA_CORS_ORIGINS` is only needed when bypassing that
proxy — see `web/README.md`.

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

All commands run from `web/`. TypeScript, React and Vite. Full command list,
the e2e-against-a-real-backend setup, and the dev-proxy details are in
[`web/README.md`](web/README.md); the essentials:

```bash
npm ci             # install exactly what the lockfile says
npm run dev        # run against a backend on localhost:8000
npm test           # component tests (Vitest)
npm run e2e        # end-to-end tests in a real browser (Playwright)
npm run lint       # ESLint, including the accessibility rules
npm run typecheck  # tsc --noEmit
npm run format     # Prettier, writing
npm run build      # typecheck, then a production build into dist/
```

CI runs `npm run format:check`, so format before pushing or the client job
fails on whitespace. `npm run e2e` needs a browser once:
`npx playwright install chromium`.

### Git hooks

A pre-commit config (`.pre-commit-config.yaml`, repo root) mirrors CI locally:
ruff check/format + hygiene checks run on every commit; the full pytest suite
runs on every push, so a broken branch never reaches the remote. One-time
setup: `uv tool install pre-commit && pre-commit install --hook-type
pre-commit --hook-type pre-push`. Run everything on demand with `pre-commit
run --all-files`.

**CI only triggers on pushes to `main` and PRs targeting `main`** — a feature
branch gets zero CI feedback until its PR is opened, so the local pre-push
pytest gate is the only safety net on a branch. Run tests locally before
pushing rather than relying on CI to catch a broken branch.

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

Full reasoning is in
[`docs/specs/code-style.md`](docs/specs/code-style.md). None of this is
caught by lint or format — that's why it has to be read, not just run. The
a11y rule is also enforced by `eslint-plugin-jsx-a11y` in CI.

- One decision, one place — duplicated policy drifts; move it up, not sideways.
- Check the SDK before writing a helper.
- Tests import constants, never transcribe them.
- A docstring is one line, plus documented params in Python (`Args:`,
  `Returns:`/`Raises:` where they matter, route handlers excepted). In
  TypeScript, types do that job — a summary line and nothing else.
- A comment inside a function is the last resort — only a genuine surprise
  the reader cannot deduce; narrative history, alternatives considered, and
  reassurance belong in git and `docs/specs/`, not the source.
- A comment is a claim: when you change behaviour, the comments above it are
  part of the diff.
- A placeholder names a live issue and dies when it ships — closing an issue
  includes grepping for its number.
- A component reads what it uses; don't thread dependencies through a parent
  that only forwards them.
- Never key a component by state its own output changes.
- The fake enforces the server's rules, including surprising ones.
- Every component gets at least one test; assert what's on screen, not that
  nothing threw; mutation-test every guard by hand (break it, confirm the
  test fails, restore it); probe with a throwaway print before you fix; verify
  a11y claims against a running build, not the framework's own semantics tree.

## Architecture

See [`docs/architecture.md`](docs/architecture.md) for the phased roadmap and
tech stack, and [`docs/specs/layering.md`](docs/specs/layering.md) for where
orchestration logic belongs (routers vs. `app/library.py`) and why. What
follows is what isn't written down anywhere else — the gotchas you'd only
find by reading the code.

**Settings and the lazy engine** (`app/config.py`, `app/db.py`): the
SQLAlchemy engine is built lazily in `get_engine()` (`lru_cache`d) rather than
at import time, because a module-level engine would resolve real settings —
and create a real `libra.db` — the moment anything imported `app.db`, before
tests get a chance to override settings. Tests override both `get_settings`
and `get_session` as FastAPI dependencies (see `tests/conftest.py`), plus a
session-scoped autouse fixture that repoints the *process-wide* settings at a
temp dir so `app.main`'s `lifespan` — which calls `init_db()` on startup —
never touches the repo.

**Upload pipeline** (`app/routers/books.py`, `app/epub.py`, `app/storage.py`):
`POST /books/upload` derives the book record from the file itself rather than
asking the caller to describe it. The three modules split cleanly —
`storage.py` is filesystem mechanics with no book knowledge, `epub.py` is
EPUB/OPF parsing with no storage knowledge, `routers/books.py` orchestrates
both in a fixed order: stage → validate → parse → commit → insert. Full
pipeline detail (storage layout, the untrusted-XML guards, the sha256 hash)
is in
[`docs/architecture.md`](docs/architecture.md#upload-and-metadata-extraction).

**Data model** (`app/models.py`): `BookCreate`/`BookRead`/`BookUpdate` are
separate `SQLModel` classes rather than one model with optional fields —
`BookUpdate` is hand-defined specifically to omit `file_path`, so a client can
correct metadata but never storage-owned fields.

**Test fixtures** (`tests/conftest.py`, `tests/epub_factory.py`):
`epub_factory.build_epub()` generates minimal-but-spec-valid EPUBs
programmatically, rather than committing binary fixtures, so a malformed
variant (bad mimetype, missing container, entity-bomb OPF) is one keyword
argument away from the happy path.

**Phase boundaries**: `rag/` and `agent/` exist as empty placeholder packages
for Phase 2/3 — don't build ahead of the current phase's scope. Calibre-backed
format conversion and Kindle email delivery are the remaining *Phase 1* items;
RAG ingestion, the vector store, and the librarian agent are Phase 2/3.
