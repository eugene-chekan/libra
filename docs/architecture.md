# libra — Architecture

## Vision

A local-first, self-hosted ebook library manager, simpler in scope than
Calibre-web, built specifically around Kindle delivery workflows, supporting
EPUB in the first iteration.

Its AI part is search over the text of the books: a reader asks a question and
gets the passages that answer it. In the diploma, that search is built and
measured as a retrieval experiment. An AI "librarian" agent that reasons across
the whole library comes after the diploma.

One instance serves a household: the catalog of books is shared, while
reading progress, ratings, shelves, and personal tags belong to individual
users.

## Phased scope

**The diploma scope changed on 2026-09-13.** The supervisor turned Phase 2 into
a retrieval experiment, the user study left the diploma, and the librarian
agent (Phase 3) moved to after it. See
[specs/phase-2-plan.md](specs/phase-2-plan.md).

**Execution order is 1 → 4 → 2, then 3 after the diploma.** The phase numbers
below are unchanged, because they are referenced throughout the specs, but the
client was built before the RAG pipeline and the agent. Phase 1 finished in
twelve days against a two-month budget, and the slack was better spent proving
the API against a real client — nothing else had ever exercised it — than held
in reserve. See [specs/phase-4-plan.md](specs/phase-4-plan.md), including which
parts are stubbed and why RAG management is not among them.

**Phase 1 — Backend core (diploma months 1–2) — COMPLETE**
- FastAPI app, book metadata CRUD, local file storage, SQLite persistence
- Alembic migrations
- Multi-user: password auth, sessions, an admin role, per-user reading state
- Kindle delivery: email-based "Send to Kindle" integration, per-user address
- Library organization: shelves, tags, ratings, reading progress, cover art

The last two bullets were added after the UI design handoff arrived; see
[specs/library-organization.md](specs/library-organization.md). Both are
deliberately placed here rather than alongside the Phase 4 client: they are
backend model work that is fully testable without a UI, and user scoping in
particular is the most expensive thing in the project to retrofit — every
endpoint gains a `current_user` dependency and every query a scoping clause,
which is an afternoon against four endpoints and a rewrite against twenty.

**Format conversion has moved out of Phase 1**, to after Phase 2. It is the
least novel work in the project, and it turns out not to block Kindle
delivery the way [specs/format-conversion.md](specs/format-conversion.md)
assumed. Deferred deliberately and on the record, not dropped — the reasoning
and the sequencing that replaced it are in
[specs/phase-1-plan.md](specs/phase-1-plan.md), which is the working plan for
this phase.

**Phase 2 — Retrieval experiment (Sep 2026 – Jan 2027)** — see
[specs/phase-2-plan.md](specs/phase-2-plan.md)
- **Part 1, for the practice defense (9–14 Nov):** compare ways to find the
  passage that answers a question — BM25, text embeddings, LLM-written semantic
  descriptors, and hybrids — on 40 public-domain books, split into fiction and
  non-fiction
- Chunks over the EPUB spine. Chunks, the FTS5 index and the vectors live in
  the same SQLite database, and vector search is exact, in memory
- Evaluation: reviewed test questions, each with one known source chunk;
  recall@5, recall@10 and MRR@10, with confidence intervals
- **Part 2, for the pre-defense demo (6–9 Jan):** the librarian panel shows the
  passages search finds, in place of its canned replies. It does not write
  answers

**Phase 3 — Librarian agent (after the diploma)**
- Moved out of the diploma on 2026-09-13. Written answers built from the
  passages Phase 2 finds come first, then the agent below
- Anthropic SDK agent with tools: `search_library`, `get_book_metadata`,
  `answer_about_book` (RAG-backed), `recommend_similar`
- Evaluation: task success rate on a defined scenario set
- The agent is a second path to every piece of data in the system and must
  enforce the same user scoping as the REST API — a `search_library` that
  ignores it will surface another household member's private shelves, and
  `recommend_similar` should reason over the caller's reading history, not
  everyone's. An authorization boundary present in one interface and absent
  in the other is not a boundary. Giving it one implementation rather than
  two is why library operations are written outside route handlers from
  Phase 1 onward — see [specs/layering.md](specs/layering.md).

**Phase 4 — Web client — COMPLETE** — *built ahead of Phases 2 and 3*
- TypeScript + React web client: library browsing, search, chat interface to
  the agent. It builds real page elements, so the accessibility this client
  promises can be tested, and so a real browser can drive it end-to-end — see
  [specs/phase-4-plan.md](specs/phase-4-plan.md)
- This is the client shown at defense
- The chat surface ships as a designed screen against a stubbed service; what
  that stub has to answer becomes input to the Phase 3 spec rather than
  something the agent decides alone. RAG management screens are deliberately
  not built — see [specs/phase-4-plan.md](specs/phase-4-plan.md)
- Carries a small amount of backend work, because the design needs three
  things Phase 1 did not build: notes endpoints (over the `Note` table, which
  was defined early for exactly this reason), `GET /books/{id}/file`, and
  `DELETE /users/{id}`, whose behaviour was already specified but never
  exposed. All land before any client screen depends on them
- **Includes an in-browser EPUB reader**, added to scope on 2026-08-09. It
  needs no new endpoint: the client fetches the whole book from
  `GET /books/{id}/file` and epub.js unzips it in the browser, resolving the
  archive's own images and stylesheets to `blob:` URLs. Rendering is epub.js
  inside an iframe it marks `sandbox="allow-same-origin"` with `allow-scripts`
  left off, so no JavaScript in the book runs — book markup comes from an
  uploaded file, and putting it into the page unguarded would be stored XSS.
  Spine parsing in `app/epub.py` was planned for this too, but the browser
  does that half now, so it belongs to Phase 2's chunker alone. Reading
  progress is observed from scroll position rather than typed in by the reader
- The design work is done up front rather than alongside: see
  [specs/client-design.md](specs/client-design.md), which closes the six
  surfaces the handoff never drew and restores the design tokens into the
  tree

**Phase 5 — Desktop/mobile (post-diploma, own pace)**
- **Not a free build target.** The TypeScript web client does not produce
  desktop or mobile builds on its own. Candidates are a PWA — a web app a
  phone can install like a normal app — or a wrapper such as Tauri or
  Capacitor. Chosen after the diploma
- Local file-system integration for desktop imports

## Non-goals for diploma window

- Public multi-tenancy. Libra supports several users on one self-hosted
  instance — a household sharing a library — not accounts for strangers.
  Concretely out: self-registration, email verification, password reset
  flows, and per-book access control. Admin creates accounts; every user can
  see every book. Reading state, shelves, and personal tags are private.
- Full DRM handling (explicitly out of scope, not silently ignored)
- Desktop/mobile builds
- Written answers from the librarian, and the librarian agent. Both come after
  the diploma. In the diploma the librarian panel shows search results only
- A user study. It was removed from the diploma on 2026-09-13; the retrieval
  experiment replaces it
- Autonomous multi-step agent planning — when the agent comes, it stays
  tool-calling, not open-ended planning and execution

## Version numbers

**One number, and it lives in `backend/pyproject.toml`.** `scripts/run.sh`
builds the client into the wheel, so the two halves are one artifact and one
thing to name. `web/package.json` still carries a version because npm wants
one; nothing reads it. `app/version.py` reads the number back out of the
installed package, so it is never written down twice.

**The minor version moves when a phase completes.** `0.1.0` is Phase 1
finished; `0.2.0` is Phase 4 finished. Five phases, five minor bumps, `1.0.0`
when the project is done. The patch goes back to `0` each time.

**The patch version moves once for each group of fixes** merged after a phase
completes, in its own small PR: `0.2.1` is the first group after Phase 4. A fix
PR never changes the version itself, so two open fix PRs never edit the same
line. The patch moves at all because the build id below is there only when
something set it. An instance started without it reports no build, and then
the version is the only way to tell code with the fixes from code without them.

**The commit does the fine-grained work.** `scripts/run.sh` and `run.ps1` set
`LIBRA_BUILD` from `git rev-parse --short HEAD`, and the Dockerfile takes the
same value as a build argument. So the version answers "which phase, and which
group of fixes", and the build answers "which exact code".

`GET /health` reports both — `{"status": "ok", "version": "0.2.4", "build":
"44f0320"}` — omitting `build` entirely when nobody set one. It is
unauthenticated, like the rest of `/health`: on a self-hosted instance being
able to ask what is running is the point. The client shows the same line under
the sidebar's account row, read from the server rather than compiled in.

## Evaluation methodology

Built alongside each phase, not retrofitted afterward — see
[evaluation.md](evaluation.md) for the live benchmark definitions.

- **Retrieval (Phase 2)**: reviewed test questions, each with one known source
  chunk; recall@5, recall@10 and MRR@10 per genre, with confidence intervals.
  The protocol is frozen in `experiment/protocol.md` before the full run
- **Agent (after the diploma)**: a scenario set (e.g. "find a book matching
  this vague description", "summarize themes in book X") with pass/fail or
  graded scoring

## Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Backend | FastAPI (Python 3.12+) | async, good for RAG/agent endpoints |
| Persistence | SQLite → Postgres if needed | start simple |
| Migrations | Alembic | needed once `create_all()` can no longer add columns |
| Auth | Argon2id + server-side sessions | revocable; JWT statelessness buys nothing with one server |
| Format conversion | Calibre `ebook-convert` CLI | don't reimplement |
| Search index | SQLite: FTS5 for BM25, vectors stored as bytes, exact search with numpy | one database for books and chunks; replaces the planned Chroma — see [specs/phase-2-plan.md](specs/phase-2-plan.md#why-sqlite-not-chroma) |
| Embeddings | `BAAI/bge-base-en-v1.5` through `fastembed` | runs on the CPU with ONNX Runtime; no PyTorch, no GPU |
| Descriptors | DeepSeek `deepseek-v4-pro`, OpenAI-compatible API | every response is saved, so the evaluation never calls the API |
| Agent | Anthropic SDK, tool use | after the diploma; keep the tool set small at first |
| Client | TypeScript + React, built by Vite | real page elements, so screen readers and browser tests both work |
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

**The year** is refused rather than guessed at. Many files put the moment the
*file* was built in `dc:date`, and that is not the year the book came out.
Three signals say a date is about the file, and each one leaves `year` empty:

- `opf:event="creation"` or `"modification"`, which OPF 2 files label plainly.
- A date with a time of day in it that is the same instant as the file's
  `dcterms:modified`. One tool wrote both.
- A date with a time of day in it, in a file from a publisher that is known to
  stamp its build there. Standard Ebooks is the only one so far: their
  `se prepare-release` writes the ebook's first release moment, so "The Secret
  History" by Procopius, a sixth-century work, arrived as a 2023 book. Nothing
  anywhere else in their OPF states the original year, so there is nothing to
  read instead.

A date with no time of day is never suspected: a book can be published on the
day its file was built, and a plain year in one of these files was typed by a
person. An empty year is the standing answer to "the file did not say" — a
blank year can be corrected, a wrong one cannot even be noticed. Alembic
revision `ede8e57ae05c` clears the years already stored this way, and only
those that still match the date the file gave.

**Untrusted XML**: `ElementTree` expands internal DTD entities, so a doctype
or entity declaration in `container.xml` or the OPF is rejected outright.
Neither file uses one in practice, which closes off billion-laughs style
expansion without adding a third-party parser. Zip member reads are also
size-capped against a member that claims to be small and expands hugely.

**The description is untrusted too.** `dc:description` is stored exactly as the
file wrote it, and Standard Ebooks writes HTML there. The client never puts it
into the page as raw HTML. `web/src/book/Description.tsx` reads it with the
browser's `DOMParser` and rebuilds only `p`, `br`, `i`, `em`, `b`, `strong`, and
links whose address is `http` or `https`. Every other tag keeps only its text,
`script` and `style` lose their text too, and no attribute is copied. So a book
cannot run code in the page (stored XSS).

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

**Still deferred**: Kindle email delivery remains a Phase 1 item and now has
real files to operate on. Calibre-backed format conversion has moved out of
Phase 1 — see [specs/phase-1-plan.md](specs/phase-1-plan.md). The larger
remaining Phase 1 work is auth and library organization, neither of which
existed as a goal when this section was written.
