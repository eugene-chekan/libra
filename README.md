# libra

A local-first, self-hosted personal ebook library manager — simpler in scope
than Calibre-web, built around Kindle delivery workflows — with a RAG-backed
AI "librarian" agent that can answer questions about and across your library.

This is also a Bachelor's diploma project (6-month build window), so code
quality, structure, and testability are treated as first-class concerns.

## Status

**Phase 1 — Backend core (in progress).** FastAPI backend with EPUB upload,
automatic metadata extraction, book CRUD, and SQLite persistence.

Still to come in Phase 1: multi-user accounts, Kindle delivery, and library
organization (shelves, tags, ratings, reading progress, covers) — planned in
[docs/specs/phase-1-plan.md](docs/specs/phase-1-plan.md). The RAG pipeline,
the librarian agent, format conversion, and the client come later; see
[docs/architecture.md](docs/architecture.md) for the roadmap.

The configuration and Kindle sections below describe the target setup,
including settings whose features are not built yet.

### API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/books/upload` | Upload an EPUB; metadata is parsed from the file |
| `POST` | `/books` | Create a book row from supplied metadata |
| `GET` | `/books` | List books |
| `GET` | `/books/{id}` | Fetch one book |
| `PATCH` | `/books/{id}` | Correct a book's metadata |
| `DELETE` | `/books/{id}` | Delete a book and its stored file |

Uploading is the primary path: `POST /books/upload` validates the EPUB, pulls
title/author/language/publisher/subjects out of its OPF package document, and
stores the file under a generated name. Missing metadata falls back to the
filename and `"Unknown"` rather than failing the upload, and `PATCH` is there
to fix whatever the parser guessed wrong.

### Configuration

Settings are read from the environment with a `LIBRA_` prefix (or a `.env`
file in `backend/`):

| Variable | Default | Purpose |
|---|---|---|
| `LIBRA_DATABASE_URL` | `sqlite:///./libra.db` | Database connection |
| `LIBRA_LIBRARY_DIR` | `./library` | Where ebook files are stored |
| `LIBRA_MAX_UPLOAD_BYTES` | `104857600` (100 MB) | Upload size ceiling |
| `LIBRA_SMTP_HOST` | — | Mail server for Kindle delivery; unset disables the feature |
| `LIBRA_SMTP_PORT` | `587` | Mail server port |
| `LIBRA_SMTP_USERNAME` | — | Mail account username |
| `LIBRA_SMTP_PASSWORD` | — | Mail account password — environment only, never commit it |
| `LIBRA_SMTP_FROM` | — | Sender address; **every user must approve this one** |
| `LIBRA_KINDLE_MAX_ATTACHMENT_BYTES` | `52428800` (50 MB) | Amazon's attachment ceiling |

## Project structure

```
libra/
├── backend/
│   ├── app/              # FastAPI app: routes, models, config
│   ├── rag/              # ingestion, chunking, embeddings, retrieval (Phase 2)
│   ├── agent/             # librarian agent + tools (Phase 3)
│   ├── tests/
│   ├── pyproject.toml
│   └── Dockerfile
├── client/                # Flutter app (Phase 4+)
├── docs/
│   ├── architecture.md
│   ├── evaluation.md
│   └── specs/             # per-feature design docs and the Phase 1 plan
├── scripts/
│   └── docker-compose.yml
└── .github/workflows/
    └── ci.yml
```

## Setup

Requires Python 3.12+ and [uv](https://docs.astral.sh/uv/).

```bash
cd backend
uv sync --all-groups
uv run uvicorn app.main:app --reload
```

The API is served at `http://localhost:8000`; interactive docs at
`http://localhost:8000/docs`.

### Kindle delivery

Setup has two halves: SMTP is configured **once for the whole server**, and
then **each user approves the sender address on their own Amazon account**.
libra cannot do the second half for anyone — Amazon exposes no API for it.

**1. Configure SMTP (server admin, once)**

Set the `LIBRA_SMTP_*` variables above. Use a dedicated mailbox rather than a
personal one: the address becomes something every user has to approve, and a
dedicated account's app password is easy to revoke without disrupting anything
else.

**2. Approve the sender address (each user, once)**

Amazon accepts personal documents only from addresses on your approved list:

1. Sign in to Amazon → **Account & Lists → Manage Your Content and Devices →
   Preferences → Personal Document Settings** (the exact path moves
   occasionally).
2. Under **Approved Personal Document E-mail List**, add the address in
   `LIBRA_SMTP_FROM`.
3. On the same page, find your device's own **`@kindle.com` address** and set
   it as your Kindle address in libra.

> **Mail from an unapproved address is silently discarded.** No bounce, no
> error, no notification — Amazon simply drops it. libra can only report that
> its mail server accepted the message, never that a Kindle received it. If
> sends look successful but nothing arrives on the device, an unapproved
> sender address is almost always the reason.

Books are sent as EPUB with no conversion: Send to Kindle accepts EPUB
directly. Note that Amazon's attachment ceiling (~50 MB) is lower than
libra's upload ceiling (100 MB), so a very large book can be stored but not
emailed.

### Running with Docker

```bash
docker compose -f scripts/docker-compose.yml up --build
```

### Tests and lint

```bash
cd backend
uv run pytest
uv run ruff check .
```

### Git hooks

A [pre-commit](https://pre-commit.com) config mirrors the CI checks locally:
lint/format run on every commit, the full test suite runs on every push, so a
broken branch never leaves the machine. One-time setup:

```bash
uv tool install pre-commit
pre-commit install --hook-type pre-commit --hook-type pre-push
```

To run everything on demand without committing:

```bash
pre-commit run --all-files
```

## Conventions

- Python 3.12+, type hints everywhere
- `ruff` for lint/format, `uv` for package management
- [Conventional commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, `docs:`, `test:`)
- Small, tested functions — this needs to hold up to diploma committee scrutiny

## License

MIT — see [LICENSE](LICENSE).
