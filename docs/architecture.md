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
- **No upload logic yet**: `file_path` is accepted as a plain string field.
  Actual file ingestion (upload, storage layout, Calibre conversion) is
  deferred until the RAG/ingestion work in Phase 2 defines the storage
  contract.
- **Dependency management**: `uv` + `pyproject.toml`, dev dependencies
  (`pytest`, `httpx`, `ruff`) split into a `dev` dependency group so
  production images stay lean.
