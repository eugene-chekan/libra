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

Record the answers here as they are decided; Phase 3 starts from them.

## Design gaps to close first

The handoff specified five screens to a high standard and stopped there. These
are missing and block the client regardless of when it is built:

- **Login**, and what session expiry looks like mid-session.
- **User administration** — creating accounts, granting admin, per-user Kindle
  address.
- **Shelf visibility** — the control that publishes a shelf, and how a public
  one is marked.
- **Other people's public shelves** — the sidebar holds one flat shelf list
  with nowhere to put them.
- **The chat surface** itself.

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
- **Material vs. hand-rolled** is an open question — see below.
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

**`BookRead` will change shape again.** Format conversion is scheduled after
Phase 2 and adds format variants to the book model. A client written against
today's shape will break. Two options: pull conversion forward so the shape
settles before the client consumes it, or accept one deliberate breaking
change. **Unresolved — worth deciding before the client is far along.**

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

## Open questions

- **Material components restyled, or hand-rolled widgets?** "Pixel-perfect"
  and Material's defaults — ripples, 48px touch targets, focus rings — pull
  against each other. The handoff says to substitute the codebase's existing
  primitives, but there are none yet, so this is a genuine choice.
- **State management.** No decision yet; whatever is chosen should make the
  librarian service swap trivial.
- **Does the chat get its own route, or a panel over the library?** The
  sidebar has no slot for it either way, which is part of the design work.
- **Conversation persistence** — see the contract section. A schema question,
  and therefore cheapest to answer now.
