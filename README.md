# libra

A local-first, self-hosted personal ebook library manager — simpler in scope
than Calibre-web, built around Kindle delivery workflows — with a RAG-backed
AI "librarian" agent that can answer questions about and across your library.

This is also a Bachelor's diploma project (6-month build window), so code
quality, structure, and testability are treated as first-class concerns.

## Status

**Phase 1 — Backend core (in progress).** FastAPI skeleton with book metadata
CRUD and SQLite persistence. No file upload, RAG pipeline, agent, or client
yet — see [docs/architecture.md](docs/architecture.md) for the full roadmap.

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
