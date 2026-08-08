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

All endpoints except `/health` and `POST /auth/login` require a session — see
[Accounts and login](#accounts-and-login).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/books/upload` | Upload an EPUB; metadata is parsed from the file |
| `POST` | `/books` | Create a book row from supplied metadata |
| `GET` | `/books` | List books |
| `GET` | `/books/{id}` | Fetch one book |
| `GET` | `/shelves` | Your shelves in order, plus others' public ones |
| `POST` | `/shelves` | Create a shelf |
| `PATCH` | `/shelves/{id}` | Rename a shelf or publish it (owner) |
| `DELETE` | `/shelves/{id}` | Delete it; `?reassign_to=` moves its books first |
| `PUT` | `/shelves/order` | Reorder your shelves from a complete list |
| `GET` | `/tags` | Global tags plus your own |
| `POST` | `/tags` | Create a tag; `?make_global=true` is admin-only |
| `PATCH` | `/tags/{id}` | Rename a tag |
| `DELETE` | `/tags/{id}` | Delete it and remove it from every book |
| `PUT` | `/books/{id}/state` | Set your own rating, progress and shelf |
| `POST` | `/books/{id}/send-to-kindle` | Email the book to your own Kindle |
| `PATCH` | `/books/{id}` | Correct a book's shared metadata (admin) |
| `DELETE` | `/books/{id}` | Delete a book and its stored file (admin) |

Tags come in two kinds. **Global** tags are curated by an admin and seen by
everyone — "Sci-Fi" is a fact about the book the household should agree on.
**Personal** tags belong to one reader and are invisible to the rest; "Read
before the trip" is nobody else's business. Set a book's personal tags with
`tag_ids` on `PUT /books/{id}/state`; global tags are applied by an admin
through `/tags`, because a global assignment changes what everyone sees.

Shelves belong to readers and are private by default. Making one public lets
others read it — including your progress on the books it holds — but never
write to it. A book sits on at most one of *your* shelves; two people can
file the same book differently.

The catalog is shared; reading state is not. `GET /books` and
`GET /books/{id}` return each book with the *calling user's* rating and
progress merged in, defaulting to unrated and unstarted for a book they have
never opened. Two people can be at different points in the same book.

`year`, `blurb` and `pages` are parsed from the EPUB when it declares them —
and left blank when it does not, rather than estimated. `schema:numberOfPages`
is rare in practice, so `pages` is mostly a field an admin fills in via
`PATCH`.

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
| `LIBRA_AUTO_UPGRADE_DB` | `true` | Apply pending migrations on startup |
| `LIBRA_LOG_LEVEL` | `INFO` | Level for the app's own logs; uvicorn's request logging is separate |
| `LIBRA_CORS_ORIGINS` | `[]` | Browser origins allowed to call the API, as JSON |
| `LIBRA_SESSION_TTL_DAYS` | `14` | How long a login lasts |
| `LIBRA_SESSION_COOKIE_SECURE` | `false` | Set `true` when serving over HTTPS |
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

### Accounts and login

One instance serves a household. The book catalog is shared; reading state,
and later shelves and personal tags, belong to individual users.

There is **no open registration endpoint** — on a self-hosted server reachable
from the network, the first stranger to find one would own the library. The
first account is created from a shell on the host:

```bash
cd backend
uv run python -m app.cli create-admin --username yourname
```

It prompts for a password (or reads `LIBRA_ADMIN_PASSWORD`, for scripted
setup) and runs any pending migrations first, so it works on a fresh install
with no database yet. That admin then creates everyone else via
`POST /users`.

Logging in sets an httpOnly `SameSite=Lax` session cookie. Sessions live in
the database, so logging out revokes them server-side rather than merely
clearing the browser's copy.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/auth/login` | Exchange credentials for a session cookie |
| `POST` | `/auth/logout` | Revoke the current session |
| `GET` | `/auth/me` | The current user |
| `GET` | `/users` | List accounts (admin) |
| `POST` | `/users` | Create an account (admin) |
| `PATCH` | `/users/{id}` | Update a profile; admin to change `is_admin` or edit another user |

Every other endpoint requires a session. Reading the catalog and uploading to
it are open to any user; **editing shared book metadata and deleting books
are admin-only**, because both change what everyone sees.

**Serving over HTTPS?** Set `LIBRA_SESSION_COOKIE_SECURE=true`. It defaults
to `false` because the common deployment is plain HTTP on a home LAN, where a
secure-only cookie would never be sent and login would appear to fail
silently.

**Browser client on another origin?** Set `LIBRA_CORS_ORIGINS` to a JSON list,
e.g. `'["http://localhost:8080"]'`. Cookie auth requires credentialed CORS,
which the spec forbids combining with a `*` origin — so origins have to be
enumerated and there is no permissive default.

### Logs

Written to stdout under the `libra.*` namespace, alongside uvicorn's own
request logging — read them with `docker compose logs -f` or journald. There
are no log files to rotate.

The app logs sparingly, and only where it deliberately carries on after
something went wrong and would otherwise say nothing:

- a stored file that could not be deleted, leaving a stray file on disk
- a commit falling back from a rename to a copy, meaning `LIBRA_LIBRARY_DIR`
  is on a different mount from the system temp directory
- an orphaned file cleaned up after a failed database insert
- a rejected login, with the attempted username but never the password
- a schema upgrade actually applying on startup

Set `LIBRA_LOG_LEVEL=DEBUG` for more, `WARNING` for less. It governs only the
app's own loggers; uvicorn's access log is configured by uvicorn.

### Database migrations

The schema is owned by [Alembic](https://alembic.sqlalchemy.org/). The app
applies pending migrations on startup, so a normal upgrade needs no action —
pull the new version and start it.

To run them yourself (or if you set `LIBRA_AUTO_UPGRADE_DB=false` to make
migrations a separate deploy step):

```bash
cd backend
uv run alembic upgrade head
```

After changing a model, generate the matching revision and read it before
committing — autogenerate is a good first draft, not a finished one:

```bash
uv run alembic revision --autogenerate -m "what changed"
```

`uv run pytest tests/test_migrations.py` fails if a model has drifted ahead
of the migrations, so a forgotten revision is caught locally rather than as
a runtime error later.

> **Upgrading a database created before Alembic was introduced?** It already
> has a `book` table, so the baseline revision would fail trying to create
> one. Mark it as current instead of running it — once, then upgrade
> normally from then on:
>
> ```bash
> uv run alembic stamp 45e89aabeb7c
> ```

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
directly. `GET /auth/me` returns `kindle_sender`, the address to approve, so
you never have to go looking for it.

Amazon's attachment ceiling (~50 MB) is lower than libra's upload ceiling
(100 MB), so a very large book can be stored but not emailed — and the check
runs against the *encoded* size, since base64 inflates an attachment by about
a third. A 45 MB book is roughly 60 MB on the wire.

`POST /books/{id}/send-to-kindle` responds `202`, not `200`, and reports
`attempted_at` rather than `sent_at`. Handing the message to the mail server
is the last thing libra can observe.

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
