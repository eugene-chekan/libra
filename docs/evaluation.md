# libra — Evaluation Methodology

This document tracks how each major subsystem is evaluated, evolving
alongside the implementation rather than being written retroactively. See
[architecture.md](architecture.md) for the phased build plan this supports.

## Phase 1 — Backend core

No model-facing evaluation yet. Correctness is covered by the pytest suite
in `backend/tests/` (one test per endpoint, plus edge cases like 404s).

## Phase 2 — RAG (planned)

**Method**: for each ingested book, hand-build a small set of QA pairs
(question, expected answer, expected supporting passage(s)).

**Metrics**:
- Retrieval precision@k / recall@k — does the retriever surface the
  passage(s) that support the expected answer within the top-k results?
- Tracked per book and in aggregate, so regressions in the chunking or
  embedding strategy are visible book-by-book.

**Open questions to resolve in Phase 2**: chunk size/overlap strategy,
choice of embedding model (local vs API-based), and how many QA pairs per
book are enough to be statistically meaningful without being a burden to
hand-author.

## Phase 3 — Librarian agent (planned)

**Method**: a fixed scenario set exercising the agent's tools, e.g.:
- "Find a book matching this vague description" (tests `search_library`)
- "Summarize themes in book X" (tests `answer_about_book`, RAG-backed)
- "Recommend something similar to book Y" (tests `recommend_similar`)

**Metrics**: pass/fail or graded scoring per scenario (rubric TBD in
Phase 3), plus tool-call correctness (did the agent choose the right tool
for the request, not just produce a plausible-sounding answer).

## Phase 4+ — Client

**Revised 2026-08-21.** This section used to say there was no automated
evaluation, only manual walkthroughs. That was not really a choice. The
Flutter client painted itself onto a single canvas instead of building real
page elements, so Playwright — a tool that clicks through a real browser —
had nothing to click. Same root cause as issue #50. See
[specs/client-stack.md](specs/client-stack.md).

The TypeScript client builds real page elements, so the client can be tested
the way the backend is:

- **Component tests** (Vitest + React Testing Library) — at least one per
  screen and per shared component, against a fake API client that copies the
  server's rules, including the surprising ones.
- **End-to-end tests** (Playwright) — the golden path, browse → search →
  chat, driven through a real browser against a scratch instance.
- **Accessibility checks** — `eslint-plugin-jsx-a11y` in CI, plus keyboard
  and screen-reader passes over the golden path.
  [specs/client-design.md](specs/client-design.md) makes accessibility
  promises, and the Flutter client showed that an untested promise here is
  simply false. It needs evidence, not intent.

Manual walkthroughs stay, for the one thing a test cannot judge: whether the
screens look right.
