# Phase 4 — Client: Scope and Plan

**Status:** Active. Written 2026-08-09, the day after Phase 1 completed.

Phase 4 is being built **before** Phases 2 and 3 rather than after. The phase
numbers stay as they are — they are referenced across
[architecture.md](../architecture.md) and every spec — but the execution order
is now **1 → 4 → 2 → 3**.

## Why reorder

Phase 1 was budgeted two months and took twelve days (29 July – 9 August),
banking roughly six weeks. That slack is what makes this a scheduling choice
rather than a gamble.

Three reasons to spend it here:

- **No real client has ever exercised this API.** All 271 tests run in
  process. They cannot catch an awkward response shape, a field the UI needs
  and does not get, or a CORS misconfiguration. A client is the only way to
  find those, and finding them now — with time to change the API — is worth
  considerably more than finding them in month six.
- **The catalog half of the client depends on nothing that is unbuilt.** Every
  screen in the design handoff maps onto endpoints that shipped in Phase 1.
- **The agent surface has to be designed anyway.** The handoff contains no
  chat screen. Designing it now, alongside the rest, produces one coherent
  application instead of a screen bolted on later.

## Scope

### Real — backed by shipped endpoints

The API is **17 paths / 26 operations** as of Phase 1's close.

| Screen | Endpoints |
|---|---|
| Login, session expiry | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| Library grid, search, tag filter | `GET /books?q=&tags=&shelf_id=&sort=` |
| Book detail, rating, progress, shelf, tags | `GET /books/{id}`, `PUT /books/{id}/state` |
| Covers | `GET /books/{id}/cover`, `has_cover` on every book |
| Shelves page and management | `GET/POST /shelves`, `PATCH/DELETE /shelves/{id}`, `PUT /shelves/order` |
| Tag management | `GET/POST /tags`, `PATCH/DELETE /tags/{id}` |
| Add book | `POST /books/upload` |
| Send to Kindle | `POST /books/{id}/send-to-kindle` |
| User administration | `GET/POST /users`, `PATCH /users/{id}` |

Two endpoint groups are added in Phase 4 — see *Where the design and the API
disagree* below: notes CRUD, and `GET /books/{id}/file`.

## Where the design and the API disagree

The handoff was drawn before the API existed, so six of its assumptions do not
survive contact with what shipped. These are the decisions that shape the
milestones, and none of them is cosmetic.

**1. Nothing serves book content.** The book routes are `GET/PATCH/DELETE
/books/{id}`, `/cover`, `/send-to-kindle`, `/state` — there is no download.
The design's primary button ("Start Reading" / "Continue Reading" / "Read
Again") therefore pointed at nothing, and no phase plans an in-browser reader.
Conversely the design has **no Send to Kindle control at all**, which is a
strange gap in an app built around Kindle delivery.

*Decision:* add `GET /books/{id}/file`, serving the EPUB as an attachment. The
design keeps its three-state primary button and its label; the button
downloads, and the reader is whatever the user already uses. Send to Kindle
joins the action row as an outlined secondary. The endpoint mirrors the cover
route — authenticated, resolved through `storage.resolve()`, `FileResponse`.
The one new concern is `Content-Disposition`: the original filename in
`book_metadata` is client-supplied and must be sanitized before it reaches a
header, not echoed.

**2. Notes are designed but have no endpoints.** The `Note` table exists —
Phase 1 defined it deliberately and deferred the endpoints — while the detail
screen specifies a Notes & Highlights panel. The handoff hedges: *"Notes are
hardcoded placeholder content in the prototype... confirm scope before
building."*

*Decision:* build the endpoints now. Unlike the librarian there is nothing to
guess — the table already fixed the shape — and a second stub on an app that
is already stubbing its headline feature is where a project starts reading as
a demo.

**3. The Add Book modal contradicts the upload pipeline.** The design is a
manual metadata form with a **no-op** upload zone, and it offers "EPUB or
PDF"; the API is upload-first and rejects PDF with a 415.

*Decision:* redesign rather than port. Drop an EPUB → `POST /books/upload` →
the server returns parsed metadata → the user confirms or corrects it. The
client **never calls `POST /books`**: that endpoint takes a caller-supplied
`file_path` and exists for CLI and import paths, which is exactly why
`storage.resolve()` guards it.

**4. Tag colours have no stable source.** The design cycles a fixed 12-swatch
palette *by list index*, but the tag list interleaves global and personal tags
in query order, so adding a tag would recolour its neighbours.

*Decision:* hash the tag name to a swatch. Stable, no schema change, and the
design never lets a user pick a colour. A user-chosen colour is a real feature
needing a real column, and can be added when someone asks for it.

**5. The manage modals assume everything is editable.** Ours has
admin-curated global tags and other people's public shelves. The API already
anticipated this — `TagRead.editable` and `ShelfRead.editable` both ship — but
the design puts a pencil and a trash icon on every row.

*Decision:* both modals split into Shared and Mine sections, with
non-editable rows carrying no controls.

**6. No pagination, and no way to ask for unshelved books.** `GET /books`
returns `{items, total}` for the whole library.

*Decision:* leave both as they are. The design is one scrolling grid with no
pagination affordance, and "unshelved" is a client-side filter over a list
that already contains every book. Recorded here so it reads as a decision
rather than an oversight. Worth noting that covers are separate requests, so a
large library is one request per book — acceptable over HTTP/2 on localhost,
and the first thing to look at if the grid feels slow.

### Stubbed — the librarian chat

Built for real as a screen, against a fake data source. Justified because the
interaction is one nobody needs to guess at — a message list, an input, a
streaming reply, an error state — so the shell built now is very likely the
shell Phase 3 wants. Swapping a fake service for a real one is small; adding a
screen, its route and its state management later is not.

### Not built — RAG management

Deliberately excluded. Ingestion status, chunk counts, re-index triggers,
embedding-model choice: every one of those is a Phase 2 decision that has not
been made. Building screens for them is not stubbing, it is inventing
requirements for a subsystem that does not exist, and the pull to keep a
screen already built is strong enough to distort Phase 2's design. A
navigation placeholder is the whole of it.

The distinction that decides what gets stubbed: **does the stub encode
something known, or something guessed?** A chat is a chat. What a reader does
to manage a vector store is not yet known.

## The stub boundary

Three conditions, without which the stub rots instead of paying off.

**One swappable seam.** A single `LibrarianService` interface with a fake
implementation returning canned exchanges, injected exactly the way the real
one will be. If faking leaks into widgets, the eventual swap becomes a
refactor rather than a substitution.

**Visibly a stub in the interface.** A badge or banner on the screen. This
matters more for a diploma than it sounds: a screen that looks functional but
is not is a trap in a defence, and a trap for the author when judging what
remains to be done.

**No tests asserting stubbed behaviour as though it were real.** Test that the
screen renders what the service returns; do not test the canned content.
Those tests would only have to be deleted.

## The contract the stub implies

This is what turns the stub from a guess into an asset. Writing it forces
decisions the agent would otherwise make unilaterally, leaving the client to
accommodate them. The same reasoning put `search_library` in `app/library.py`
rather than a route handler: the caller's needs should shape the interface.

**All five are now answered** — designing the screen is what answered them,
which was the point. The table at the end of
[client-design.md](client-design.md)'s chat section is the summary; the
reasoning is below, kept because Phase 3 needs the *why*, not only the *what*.

The consequence for Phase 3, stated plainly: the agent's response format is
not free. It must emit text incrementally, announce tool calls as it makes
them, and carry book ids alongside prose rather than only inside it.

Questions the fake service must answer, and which therefore become **input to
the Phase 3 spec**:

- Does a reply **stream**, or arrive whole? Streaming changes the transport
  (SSE or websocket), not just the widget.
- Are **tool calls visible** while they run — "searching your library…" — or
  is the reply atomic? The design handoff has no vocabulary for this.
- Do answers carry **citations**: which book, and ideally which passage? A
  RAG-backed answer without a source is not obviously trustworthy, and
  retrofitting citations into a rendered answer is much harder than designing
  them in.
- What does a **failure** look like — model unavailable, no relevant passages,
  a question about a book not yet ingested? Each is a different message.
- Is a **conversation persisted**, and if so, per user? That is a schema
  question, and per Phase 1's own lesson it is far cheaper to answer before
  the table exists.
  **Answered: yes, per user, with the tables defined in Phase 4.**
  `Conversation(id, user_id, title, created_at)` and `Message(id,
  conversation_id, role, content, created_at, meta JSON)`, where `meta`
  carries tool calls and citations without a schema change per idea — the same
  reasoning that gave `Book` its `book_metadata` column. This mirrors the
  `Note` precedent, which has just paid off twice: a table defined ahead of its
  endpoints made the endpoints cheap, and made the shape hard to get wrong
  later. The stub therefore reads and writes **real rows**, which means the
  chat screen exercises real persistence and Phase 3 swaps only the generation
  step. The migration belongs to the chat milestone, not the earlier backend
  one — one branch, one feature, and the consumer is right there to validate
  the shape.

Record the answers here as they are decided; Phase 3 starts from them.

## Design gaps to close first

**Closed 2026-08-09 — see [client-design.md](client-design.md)**, which
specifies all six to the handoff's standard and additionally restores the
design tokens into the working tree, settles the loading/error/empty-state
conventions the handoff declined to invent, and states the accessibility
baseline. Two decisions there reach back into the API: sidebar shelf clicks
filter the library via `shelf_id`, and `DELETE /users/{id}` joins milestone 1.

The handoff specified five screens to a high standard and stopped there. These
were missing and blocked the client regardless of when it is built:

- **Login**, and what session expiry looks like mid-session.
- **User administration** — creating accounts, granting admin, per-user Kindle
  address.
- **Shelf visibility** — the control that publishes a shelf, and how a public
  one is marked.
- **Other people's public shelves** — the sidebar holds one flat shelf list
  with nowhere to put them.
- **The chat surface** itself.
- **The book detail action row.** Now six gaps, not five. The design drew
  three buttons; with the download decision above the row holds four —
  Start/Continue/Read Again, Send to Kindle, Edit Book, Move to Shelf. That no
  longer fits the drawn row, and Send to Kindle in particular is the project's
  signature feature arriving with no designed home.

Worth designing to the same standard as the original five, with tokens and
states specified. The reason those screens were straightforward to reason
about is that the design left little to improvise; a chat screen invented in
Flutter while everything else follows a design system will look like the
afterthought it was.

The design tokens are not in the working tree — the bundle was removed once
the specs superseded it. Recover with
`git checkout 9b1b423 -- docs/design_handoff_libra/`.

## Technical decisions

- **Flutter, web target first**, per architecture.md. Desktop and mobile are
  Phase 5 from the same codebase.
- **Real routes** — `/library`, `/shelves`, `/books/:id`, `/chat` — via
  `go_router`. The prototype switched a `page` string; the handoff explicitly
  asks for routable, linkable pages and a working back button.
- **Design tokens** become a generated Dart constants file plus a
  `ThemeExtension` for the values Material has no slot for.
- **Fonts bundled, not fetched.** Instrument Serif and DM Sans as
  `pubspec.yaml` assets. A local-first application that needs the network to
  render text is a contradiction that would not survive review.
- **Material as the substrate, restyled** — not hand-rolled widgets. The
  handoff's own gap list says accessibility is largely absent and must be
  rebuilt properly: real buttons, focus management, `role="dialog"`
  equivalents. Hand-rolling means reimplementing focus traversal, keyboard
  navigation and text editing to arrive back where Material starts. The
  pixel-perfect tension is resolvable — `splashFactory: NoSplash`, tightened
  density, every colour, radius and border from tokens — and the pieces that
  genuinely fight Material (the cover grid, the shelf plank gradient, the
  progress bars) were never Material components to begin with.
- **Riverpod** for state. Two properties decide it against Provider and Bloc:
  the librarian and API-client swaps become one-line provider overrides, which
  is the seam discipline this plan demands expressed as the library's native
  idiom; and async state arrives as an explicit loading/error/data type, which
  matters because the handoff leaves loading and error states undesigned and
  they would otherwise be improvised per screen or forgotten. Bloc's
  event/state ceremony would multiply the line count across what is mostly
  CRUD.
- **The chat gets its own `/chat` route**, not a panel over the library. A
  panel is arguably the better product — the library stays visible while the
  agent discusses it — but it is the larger design invention, needing a
  dismissal model, a width, and a defined relationship to the grid behind it.
  There is no design for either. A route is linkable for a demo, and can
  become a panel in Phase 3 if it earns it.
- **Auth is a cookie.** The client must send credentialed requests, and
  `LIBRA_CORS_ORIGINS` must name its origin exactly: credentialed CORS cannot
  be combined with a `*` origin. Expect this to be the first thing that breaks.

## Testing

Widget tests over the screens, and a fake API client so the suite never needs
a running backend — the same seam discipline as the librarian stub.

The one thing worth testing hard is **session expiry**, because it is the only
state the whole application shares and the only one that appears without a
user action.

## Risks

**`BookRead` will change shape again — resolved: accept it.** Format
conversion is scheduled after Phase 2 and adds format variants to the book
model. Naming the change shrinks it: conversion *adds* variants, it does not
remove `format` or `file_path`, so the change is additive and breaks a client
only where deserialization is exhaustive. Mitigation is one line of
discipline — `fromJson` ignores unknown fields. Pulling conversion forward
would re-spend on the least novel work in the project the very slack this
phase exists to spend, so it stays where it is.

**Stub drift.** Mitigated by the single seam and by recording the contract
above, but the honest version is that some of the chat shell will be wrong.
The bet is that a wrong shell is cheaper to correct than a missing one is to
add.

**UI work expands.** Unlike the backend milestones, there is no natural
"done". The five designed screens plus the five gaps above are the scope; new
screens need a reason.

**The agent is still the contribution.** A polished client with no librarian
is a nicer Calibre-web. Phase 4 spending its slack is fine; Phase 4 spending
Phase 3's is not.

## Milestones

One branch per milestone, as in Phase 1.

| # | Milestone | Status | Notes |
|---|---|---|---|
| 0 | Close the six design gaps | ✅ | [client-design.md](client-design.md) — tokens restored, six surfaces, plus loading/error/empty conventions |
| 1 | Notes API, `GET /books/{id}/file`, `DELETE /users/{id}` | | Backend only. Done first so no client milestone ever blocks on it |
| 2 | Scaffold | | `client/`, tokens → Dart, bundled fonts, `go_router` shell, sidebar with its new pinned footer, `ThemeExtension`, Riverpod, skeleton/error/empty primitives, CI analyze + test |
| 3 | API client + auth | | Typed client, credentialed cookies, fake-client seam, login, session expiry, route guards, account row and dropdown, sign-out, Kindle address modal |
| 4 | Library grid + search | | `#tag` autocomplete, OR/AND semantics, the shelf filter pill, gradient cover fallback, empty and first-run states |
| 5 | Book detail | | View and edit modes, rating, progress, move-to-shelf, lightbox, notes, the two-row action split, download, Send to Kindle with all five of its states |
| 6 | Shelves page + shelf manager | | Real drag-reorder, visibility control and its pill, shared-shelf section in both sidebar and page |
| 7 | Tag manager | | Shared / Mine split, `editable` respected, name-hashed colour swatches |
| 8 | Add Book | | Upload-first redesign |
| 9 | User administration | | Admin-only modal, per-row commits, destructive delete dialog |
| 10 | Librarian chat, stubbed | | `Conversation`/`Message` tables and migration, service seam, screen, streaming, citations, stub badge |

**Milestone 3 is what the reordering was for.** It is the first time anything
has reached this API from outside the process, so cookie handling, CORS and
every response shape get their first real test there. Expect it to find
things; that is the point.

## Open questions

None blocking. Milestone 0 settled the outstanding design questions; what
remains is implementation detail:

- **Drag-to-reorder implementation.** The handoff advertises it and the
  prototype never built it. `PUT /shelves/order` exists and takes the full
  order, so this is a client question only.
- **Whether `POST /books/upload` should stream progress.** A large EPUB over
  a household LAN is fast, but the Add Book modal has no progress affordance
  and the upload is the one place a reader waits on bytes. Decide in
  milestone 8, with a measurement rather than a guess.
