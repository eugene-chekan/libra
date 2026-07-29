# libra

A local-first, self-hosted personal ebook library manager — simpler in scope
than Calibre-web, built around Kindle delivery workflows — with a RAG-backed
AI "librarian" agent that can answer questions about and across your library.

This is also a Bachelor's diploma project (6-month build window), so code
quality, structure, and testability are treated as first-class concerns.

## Status

**Phase 1 — Backend core (in progress).** FastAPI backend with EPUB upload,
automatic metadata extraction, book CRUD, and SQLite persistence. Format
conversion, Kindle delivery, the RAG pipeline, the agent, and the client are
still to come — see [docs/architecture.md](docs/architecture.md) for the
roadmap.

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
│   └── evaluation.md
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

## Conventions

- Python 3.12+, type hints everywhere
- `ruff` for lint/format, `uv` for package management
- [Conventional commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, `docs:`, `test:`)
- Small, tested functions — this needs to hold up to diploma committee scrutiny

## License

MIT — see [LICENSE](LICENSE).
