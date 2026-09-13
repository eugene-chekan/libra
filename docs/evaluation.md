# libra — Evaluation Methodology

This document tracks how each major subsystem is evaluated, evolving
alongside the implementation rather than being written retroactively. See
[architecture.md](architecture.md) for the phased build plan this supports.

## Phase 1 — Backend core

No model-facing evaluation yet. Correctness is covered by the pytest suite
in `backend/tests/` (one test per endpoint, plus edge cases like 404s).

## Phase 2 — Retrieval experiment

The full design is in [specs/phase-2-plan.md](specs/phase-2-plan.md). The
protocol is frozen in `experiment/protocol.md`, committed and tagged
`experiment-protocol-v1` before the full run.

**Method**: about 340 test questions over 40 public-domain books. Each question
comes from one known source chunk, and that chunk is its correct answer. About
40 are written by hand. The rest are drafted by DeepSeek and reviewed by hand.

**Metrics**:
- recall@5 and recall@10: the share of questions whose source chunk is in the
  top k. recall@10 is the main metric.
- MRR@10.
- Split by genre (fiction, non-fiction) and by question kind (factual,
  interpretive).
- Paired bootstrap confidence intervals and paired randomisation tests, with
  the Holm correction across the main hypotheses.
- precision@k only on a 50-question sample where every relevant chunk is
  judged. With one correct chunk per question, precision@k always equals
  recall@k ÷ k.

The earlier open questions are answered in the plan: chunks of about 250–300
words with no overlap; `bge-base-en-v1.5` run locally; about 10 drafted
questions per book, with the hand-written set as a check on the drafted ones.

## Phase 3 — Librarian agent (after the diploma)

Moved out of the diploma on 2026-09-13. The method below is kept for when the
agent is built.

**Method**: a fixed scenario set exercising the agent's tools, e.g.:
- "Find a book matching this vague description" (tests `search_library`)
- "Summarize themes in book X" (tests `answer_about_book`, RAG-backed)
- "Recommend something similar to book Y" (tests `recommend_similar`)

**Metrics**: pass/fail or graded scoring per scenario (rubric TBD in
Phase 3), plus tool-call correctness (did the agent choose the right tool
for the request, not just produce a plausible-sounding answer).

## Phase 4+ — Client

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
  promises; those need evidence from a running build, not intent.

Manual walkthroughs stay, for the one thing a test cannot judge: whether the
screens look right.
