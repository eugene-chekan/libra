# libra

A local-first, self-hosted personal ebook library manager — simpler in scope
than Calibre-web, built around Kindle delivery workflows — with a RAG-backed
AI "librarian" agent that can answer questions about and across your library.

This is also a Bachelor's diploma project (6-month build window), so code
quality, structure, and testability are treated as first-class concerns.

## Status

**Phase 1 — Backend core: complete.** A FastAPI backend with EPUB upload and
metadata extraction, Alembic migrations, multi-user accounts with password
auth, per-user reading state, shelves, tags, search, cover art, and Kindle
delivery over SMTP.

Next: the web client (Phase 4), then the RAG pipeline (Phase 2) and the
librarian agent (Phase 3) — the client is deliberately built first, and it is
being written in TypeScript and React after the Flutter version was dropped on
2026-08-21 (see [docs/specs/client-stack.md](docs/specs/client-stack.md)). Format conversion was deferred out of Phase 1 — see
[docs/specs/phase-1-plan.md](docs/specs/phase-1-plan.md) for that decision and
[docs/architecture.md](docs/architecture.md) for the roadmap.

### API

All endpoints except `/health` and `POST /auth/login` require a session — see
[Accounts and login](#accounts-and-login).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/books/upload` | Upload an EPUB; metadata is parsed from the file |
| `POST` | `/books` | Create a book row from supplied metadata |
| `GET` | `/books` | Search books: `?q=`, `?tags=`, `?shelf_id=`, `?sort=` |
| `GET` | `/books/{id}` | Fetch one book |
| `GET` | `/books/{id}/cover` | The cover image, read from the EPUB |
| `GET` | `/books/{id}/file` | Download the stored EPUB |
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
| `GET` | `/books/{id}/notes` | Your own notes on a book, newest first |
| `POST` | `/books/{id}/notes` | Add a note or highlight |
| `PATCH` | `/notes/{id}` | Edit a note's text or page |
| `DELETE` | `/notes/{id}` | Delete a note |
| `POST` | `/books/{id}/send-to-kindle` | Email the book to your own Kindle |
| `PATCH` | `/books/{id}` | Correct a book's shared metadata (admin) |
| `DELETE` | `/books/{id}` | Delete a book and its stored file (admin) |

`GET /books` returns `{"items": [...], "total": N}` — an envelope rather than
a bare list, so adding pagination later cannot change the shape under a
client. Filters: `q` matches title or author case-insensitively, `tags` takes
a comma-separated list of ids, `shelf_id` narrows to one shelf, and `sort` is
`title` (default) or `added`. **Tag filters OR each other** — a book matches
if it carries any one of them — and **`q` ANDs against that result**.
Filtering by a tag or shelf you cannot see is a `404`, not an empty list.

Tags come in two kinds. **Global** tags are curated by an admin and seen by
everyone — "Sci-Fi" is a fact about the book the household should agree on.
**Personal** tags belong to one reader and are invisible to the rest; "Read
before the trip" is nobody else's business. Set a book's personal tags with
`tag_ids` on `PUT /books/{id}/state`; global tags are applied by an admin
through `/tags`, because a global assignment changes what everyone sees.

**`GET /books/{id}/file` serves the stored EPUB as an attachment**, for
reading on a Kindle, in KOReader, or wherever else you keep books. The offered
filename is rebuilt from the book's title and author rather than echoed from
whatever the uploader called the file: stored names are UUIDs precisely so a
client-supplied string never touches the filesystem, and it should not come
back out in a response header either. An in-browser reader is planned
alongside this, not instead of it — downloading a book you own stays a
first-class action.

**Notes and highlights are private**, including from an admin. The catalog is
shared and the book's existence is public, but what someone wrote in the
margin is not, so another reader's note is a `404` rather than a `403` — a
"forbidden" would confirm it exists. `page` is optional, since a reflowable
EPUB has no pages to cite; sending `{"page": null}` clears one, while omitting
the field leaves it alone.

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
├── docs/
│   ├── architecture.md
│   ├── evaluation.md
│   └── specs/             # per-feature design docs and the Phase 1 plan
├── scripts/
│   ├── run.sh             # build both halves and serve them on one origin
│   └── docker-compose.yml
└── .github/workflows/
    └── ci.yml
```

## Setup

### Running the whole thing

Requires Python 3.12+ and [uv](https://docs.astral.sh/uv/). There is no
client to build yet, so this serves the API alone. From the repository root:

```bash
scripts/run.sh
```

That builds the client, builds a wheel with the client inside it, installs it
into a throwaway environment, applies migrations, creates an admin account if
the installation has none, and serves everything on port 8000:

```
    this machine   http://localhost:8000
    other devices  http://192.168.1.6:8000
```

**Both halves share one origin**, and that is what makes the second line work.
The client asks whichever host served the page for its data, so any device on
the network can open the app as it is — no rebuild per address, no CORS
allowlist to maintain, one port to open. Serving the client separately would
mean compiling the server's address into it and rebuilding whenever that
address changed.

The script is safe to re-run: `--skip-web` reuses the last client build, `PORT`
moves the port, and the database and books live in `.run/data/`, untouched by
rebuilds.

For anything exploratory — trying a change, showing the app to someone, filling
it with throwaway books — use `scripts/run.sh --scratch`. That keeps its data
in `.run/scratch/` and wipes it on every run, so a clean slate never means
deleting a real library.

### Backend only

The API runs perfectly well on its own — useful while working on it, and the
only thing the Docker image currently serves.

```bash
cd backend
uv sync --all-groups
uv run uvicorn app.main:app --reload
```

The API is served at `http://localhost:8000`; interactive docs at
`http://localhost:8000/docs`. With no client build present it simply serves no
UI, which is not an error.

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
| `DELETE` | `/users/{id}` | Delete an account and everything private to it (admin) |

**Deleting an account keeps their books.** A shared catalog should not lose
volumes because a household member left, so uploads survive with
`uploaded_by` nulled while shelves, personal tags, reading state, notes and
sessions are removed. Their public shelves vanish for everyone — the visible
consequence, accepted rather than overlooked. An admin cannot delete their own
account, which is also why an instance can never be left with no administrator.

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
