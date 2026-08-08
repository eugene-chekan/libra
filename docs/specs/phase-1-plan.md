# Phase 1 — Scope and Plan

**Status:** Active. Written 2026-08-03, six days into the build.

Phase 1's window is diploma months 1–2, which runs from the first commit
(2026-07-29) to roughly **29 September 2026** — about eight weeks from
today. This document fixes what is in that window, in what order, and what
gets dropped first if the schedule slips.

It exists because Phase 1 changed shape twice after
[architecture.md](../architecture.md) was written: the UI design handoff
added library organization, and the decision to support a household added
multi-user. Both are specified in
[library-organization.md](library-organization.md); this document is about
*fitting them into the calendar*.

## Where things stand

Done: FastAPI app, SQLite via SQLModel, book CRUD, EPUB upload with metadata
extraction and the storage safety guarantees, CI, pre-commit hooks.

That is one feature in six days, and it is the smallest of the ones remaining.

## Scope

**In Phase 1:**

1. Alembic, before any schema change needs it.
2. Multi-user: password auth, sessions, admin role.
3. Kindle delivery, per-user address.
4. Per-user reading state and the shared catalog fields the design needs.
5. Shelves.
6. Tags.
7. Search and filtering.
8. Cover art.

**Cut from Phase 1 — format conversion.** Deferred until after Phase 2 (RAG).
Three reasons:

- It does not block Kindle delivery — **confirmed 2026-08-03**.
  `format-conversion.md` assumed it did, on the premise that a Kindle needs a
  Kindle-format file attached. Send to Kindle accepts EPUB directly, so
  delivery needs an SMTP client and nothing else. The dependency that
  justified building conversion first does not exist.
- It is the least novel work in the project. Shelling out to
  `ebook-convert` demonstrates nothing a committee has not seen; the RAG
  pipeline and the librarian agent are the actual contribution, and Phase 1
  overrunning eats directly into them.
- Its own spec has unresolved questions requiring measurement (conversion
  timing, timeout values, whether Calibre goes in CI) that cannot be answered
  without spending time on the feature itself.

The deferral is recorded rather than silent: conversion remains a stated
project deliverable, it is just no longer in the first window.

**Also out:** notes and highlights as a feature (the `Note` model is defined
in Phase 1, endpoints come in Phase 2 — see the decision log), private books,
collaborative shelves, self-registration, pagination.

## Decisions

The thirteen open questions across the two specs, resolved. Recorded here
because "why is it like that" is the question a committee asks.

### Settled by decision

| # | Question | Decision |
|---|---|---|
| 1 | Where does `pages` come from? | Parse when the file declares it, else user-entered, never estimated |
| 2 | Notes and highlights scope | `Note` model defined in Phase 1, endpoints in Phase 2 |
| 3 | Conversion sync or async | Build synchronous, measure, revisit — deferred with the feature |
| 4 | Phase 1 sequencing | Model work first; conversion cut (above) |

**`pages` (1).** EPUB 3 does declare a page count in two places, both
uncommon: `<meta property="schema:numberOfPages">` in the OPF metadata, and a
`page-list` navigation document mapping to a print edition. Read the first —
the OPF is already being parsed, so it costs nothing. The `page-list` nav is
a second document and a possible later enhancement, not Phase 1 work. When
neither exists, `pages` stays `NULL` and the user may fill it in. Nothing is
estimated: an invented page count presented as a fact is worse than a blank,
and it would not match the print edition anyone is holding. This matches the
parser's existing posture — lenient about missing content, never inventing it.

**Notes (2).** The model costs two tables' worth of nothing now and is
awkward to retrofit later, because highlights are strong RAG material and
Phase 2 will be building ingestion over these same tables. Defining it now
and building it then avoids a schema change at exactly the wrong moment.

### Settled by recommendation

These I decided; say so if you disagree with any.

| # | Question | Decision | Why |
|---|---|---|---|
| 5 | Session cookies vs. native Flutter (Phase 5) | Cookies now; give the session table a `kind` column and `expires_at` | A long-lived device token becomes a row rather than a schema change |
| 6 | `GET /books` response envelope | `{items, total}` | Header shows a count; filtering makes "total matching" meaningful; changing it later breaks every client at once |
| 7 | Default library sort | `title` ascending, with `?sort=added` available | What a browsing user expects; `?sort=` makes it a one-line change either way |
| 8 | Non-admins applying global tags | Keep admin-only | Loosening later is a permission change; tightening later breaks workflows people already have |
| 9 | `started_at` / `finished_at` on state | Add both, nullable | Neither can be backfilled. Set on first progress > 0 and on progress reaching 1 |
| 10 | Deleted user's data | `uploaded_by` nulls, books survive; shelves, personal tags, state, sessions, notes cascade | A shared catalog should not lose books when a household member leaves. Their public shelves do vanish — the visible consequence, accepted |
| 11 | Conversion timeout value | 120s starting point, validated by the measurement in (3) | Deferred with the feature |
| 12 | Calibre in CI | A separate non-blocking job when conversion lands | Keeps the fast lint/test lane fast; deferred with the feature |
| 13 | `Book.format` vs. `BookFormat` | Deferred with conversion | See the note below |

**On (13).** Deferring conversion means `BookRead` will take a second
breaking change when it eventually lands. That was an argument for doing
conversion *inside* Phase 1 while the shape was already moving. It loses to
the arguments for cutting it, but the consequence should be managed:
**schedule conversion before the Phase 4 client**, so the shape settles
before anything consumes it.

**On (12) and the format allowlist.** `mobi` should leave the allowlist —
Amazon stopped accepting it. That leaves `azw3` and `pdf`, pending the same
verification as the Kindle finding above.

## Sequence

Eight milestones, one per branch and PR, in dependency order.

Tracked as GitHub issues under the **Phase 1 — Backend core** milestone.

| # | Milestone | Issue | Depends on | Rough size | Status |
|---|---|---|---|---|---|
| 0 | Alembic + baseline revision | [#3](https://github.com/eugene-chekan/libra/issues/3) | — | 2 days | ✅ #11 |
| 1 | Auth: users, sessions, admin, CORS | [#4](https://github.com/eugene-chekan/libra/issues/4) | 0 | 1.5 weeks | ✅ #12 |
| 2 | Reading state + shared catalog fields | [#5](https://github.com/eugene-chekan/libra/issues/5) | 1 | 1 week | ✅ #14 |
| 3 | Kindle delivery | [#6](https://github.com/eugene-chekan/libra/issues/6) | 1, 2 | 1 week | ✅ #15 |
| 4 | Shelves | [#7](https://github.com/eugene-chekan/libra/issues/7) | 2 | 1 week | ✅ #16 |
| 5 | Tags | [#8](https://github.com/eugene-chekan/libra/issues/8) | 2 | 1 week | ✅ #18 |
| 6 | Search and filtering | [#9](https://github.com/eugene-chekan/libra/issues/9) | 4, 5 | 0.5 week | next |
| 7 | Cover art | [#10](https://github.com/eugene-chekan/libra/issues/10) | — | 0.5 week | |

**Progress as of 2026-08-08:** six of eight done, roughly on estimate.
Application logging (#13) was added outside the plan — it was not on the
issue list, but two specs already assumed a logger existed. About 3 weeks of
estimated work remain against ~7 weeks of window.

**Alembic first (0)** because every milestone after it changes the schema,
and `SQLModel.metadata.create_all()` silently declines to add columns to
existing tables. Introducing migrations after the first column change means
hand-writing a repair. One baseline revision stamping the current schema,
then every milestone ships its own revision. CI runs the upgrade against a
fresh database so a broken revision fails there rather than on someone's
machine.

**Auth second (1)** because it is the most expensive thing in the project to
retrofit. Every endpoint gains a `current_user` dependency and every query a
scoping clause; doing that against the four endpoints that exist today is an
afternoon, and against the twenty that will exist by milestone 6 it is a
rewrite. This milestone also retrofits the existing book endpoints and adds
the authenticated-client fixture that every later test uses.

**Reading state third (2)** because `UserBookState` is where shelf placement
lives, so it has to exist before shelves can reference it — and it is also
where Kindle delivery records `last_sent_at`, which is why it now comes
before that too. Shelves (4) and tags (5) are independent of each other and
could be swapped or parallelised.

**Kindle delivery fourth (3)**, earlier than its dependencies alone require.
It is small and needs only `User.kindle_email` and a state row to stamp, but
the vision statement calls libra "built specifically around Kindle delivery
workflows" — making it a late milestone would make it the one that gets
squeezed, and a Phase 1 that ships shelves but not the feature the product is
named around would be a bad trade. Spec:
[kindle-delivery.md](kindle-delivery.md).

**Search last-but-one (6)** because it filters over shelves and tags and
cannot be finished before they exist.

**Cover art (7) depends on nothing** — it touches `epub.py` and one new
endpoint, and is deliberately last so it is the natural thing to drop.

That totals roughly 7.5 weeks against an 8-week window, which is not slack.
See [Risks](#risks).

## Definition of done

Phase 1 is complete when:

- A household member logs in, sees the shared catalog, and has private
  progress, ratings, shelves, and personal tags that no other user can read
  or modify — with tests proving the isolation rather than asserting it.
- An admin creates users, curates the global tag vocabulary, and is
  demonstrably *unable* to read another user's private shelves.
- A book can be uploaded, found by search and tag filter, placed on a shelf,
  rated, tracked for progress, and sent to a Kindle.
- Every endpoint returns `401` unauthenticated, verified exhaustively across
  the route table.
- Migrations run forward from the current schema without data loss.
- Lint, format, and the full suite pass in CI, as they do now.

Explicitly **not** required: any client. Phase 1 is an API, exercised through
tests and `/docs`.

## Risks

**The schedule has no slack.** 7.5 estimated weeks in an 8-week window, on a
project whose first six days produced one feature. If it slips, drop in this
order: cover art (7) first — the design's gradient placeholder means a client
works without it; then tags (5), keeping shelves, since shelves carry the
reading-workflow semantics and tags are a refinement. Do not drop auth or
reading state: everything else is built on them.

**~~Kindle delivery has an unverified external dependency.~~** Closed
2026-08-03: Send to Kindle accepts EPUB, so milestone 3 is an SMTP client
against the stored file with no conversion in the path — specced in
[kindle-delivery.md](kindle-delivery.md). Two operational constraints remain,
neither of which threatens the schedule:

- **Amazon only accepts documents from an approved sender address.** The
  SMTP `From:` must be on the recipient's Approved Personal Document E-mail
  List, configured in their Amazon account. This is a per-user *setup* step
  outside libra, so it needs documenting and a sensible failure mode —
  delivery to an unapproved sender is silently discarded by Amazon rather
  than bounced, which is the worst possible feedback. Assume "sent" never
  means "delivered".
- **The attachment size limit is below libra's upload ceiling.** Send to
  Kindle caps attachments at roughly 50 MB; `max_upload_bytes` is 100 MB
  (`app/config.py`). A book in that gap uploads fine and can never be sent.
  Milestone 3 must check size before attempting delivery and fail with a
  clear message rather than handing Amazon something it will drop — against
  the *encoded* size, since base64 inflates an attachment by about a third.
  Confirm the exact figure when writing the feature.

**Auth retrofit will touch every existing test.** The four current endpoints
and their test modules all change in milestone 1. Budgeted inside that 1.5
weeks, but it is the milestone most likely to run long, and it is second, so
a slip there propagates through everything.

**Deferring conversion moves a stated deliverable out of its stated window.**
Defensible — and the reasoning is on the record here — but it is a thing a
committee can ask about, and "we ran out of time" is a worse answer than the
one in [Scope](#scope).

## Not in this plan

Phase 2 onward is unchanged except for two carried consequences: conversion
now lands after RAG rather than before it, and the librarian agent must
enforce the same user scoping as the REST API — an authorization boundary
present in one interface and absent in the other is not a boundary. Both are
noted in [architecture.md](../architecture.md).

The design handoff's gaps — no login screen, no user switcher, no shelf
visibility control, no agent surface, no mobile design — are Phase 4
blockers, not Phase 1 ones, and are listed in
[library-organization.md](library-organization.md#design-gaps-affecting-this-spec).
