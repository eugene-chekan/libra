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

No automated evaluation planned; validated via manual walkthroughs of the
golden path (browse → search → chat) ahead of the diploma defense.
