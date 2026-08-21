# Phase 4 — Client: Scope and Plan

**Status:** Active. Written 2026-08-09, the day after Phase 1 completed.

**The client stack changed on 2026-08-21**, from Flutter to TypeScript and
React. The scope, the milestones and the design in this plan are unchanged —
only the tools that build the screens changed. The reasons, the cost, and the
new stack are in [client-stack.md](client-stack.md). Where this plan names a
Flutter tool below, see the mapping table under "Technical decisions".

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
endpoint mirrors the cover route — authenticated, resolved through
`storage.resolve()`, `FileResponse`. The one new concern is
`Content-Disposition`: the original filename in `book_metadata` is
client-supplied, so the offered name is rebuilt from the catalog by
`app/naming.py` rather than echoed.

***Revised 2026-08-09, later the same day: an in-browser reader is in scope
after all*** — milestones 11 and 12. The download endpoint stands and is
unchanged; a reader who wants the file on their own device should not have to
go through the browser. What changed is the reasoning above about the primary
button, which had it downloading while keeping the label "Start Reading".
That label was making a promise the application could not keep, and the fix
turned out to be building the thing rather than renaming the button. The
deeper win is that **progress stops being declared and becomes observed** —
see the reader section below.

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

## The in-browser reader

Added after the milestone list was drawn, so recorded here rather than folded
in as though it were always planned.

**Why it earns two milestones.** The download button was going to be labelled
"Start Reading" and deliver a file to a Downloads folder, and the panel above
it was going to show a progress bar the reader had to move by hand. Both are
the same defect: the application asking to be told something it could observe.
A reader makes `progress` a fact rather than a claim, which is worth more than
the feature itself.

**Where the parse lives: the backend.** Phase 2's chunker has to walk the
spine to produce text; the reader walks it to produce markup. One parser, two
projections. Unzipping in Dart would have been faster to ship and would have
left the same walk written twice in two languages, with the RAG copy being the
one nobody notices drifting.

**Why Flutter renders it rather than epub.js.** `flutter_html` renders to
widgets and executes no JavaScript. Book markup comes from an uploaded file
and would be served from an origin carrying a session cookie, so putting it in
a browser DOM is stored XSS — the hazard `cover_for`'s media-type allowlist
already exists to prevent. epub.js is the more capable renderer and would have
needed a separate origin or a strict sandbox to be safe. The Flutter path
avoids the question instead of answering it.

***Superseded 2026-08-21: the client is TypeScript, so the question had to be
answered rather than avoided.*** The answer is the strict sandbox this
paragraph names: each chapter is rendered by epub.js inside an
`<iframe sandbox>` with `allow-same-origin` deliberately left off, which puts
the chapter in its own empty origin where it cannot read the session cookie or
touch the app around it. The hazard is real and the guard is standard. The
gain is the renderer this paragraph already called more capable. Full
reasoning in [client-stack.md](client-stack.md).

**Scrolling, not paginated.** Reflowed pagination with real page numbers is a
project of its own and is not attempted. Progress is
`(spine_index + scroll_fraction) / spine_count`, which fits the existing
`0..1` float — no schema change, and no CFI-style locator to design. The
Reading Progress panel therefore leads with a percentage and shows
"≈ page N of M" only where `pages` happens to be known.

**Accepted limitations**, stated here rather than discovered at defence:
publisher CSS is approximated rather than honoured, which is fine for prose
and poor for technical books with complex layout; and very large archives are
capped.

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

**A seventh gap opened the same day**: the reader screen, which nothing had
drawn because nothing had planned a reader. It is designed as part of
milestone 12 rather than retrofitted into milestone 0, since the screen and
the code that fills it are one piece of work — but it is held to the same
standard, and the section below records what it has to answer.

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

**Read this section as decisions about problems, not about tools.** The stack
moved to TypeScript and React on 2026-08-21, but almost every bullet below
still holds, because each one answers a question the framework does not get to
decide: should routes be real, should fonts be local, should widgets be
hand-rolled, how is state shaped. Only the names change.

| This plan says | Now read as | Still true? |
|---|---|---|
| Flutter, web target first | TypeScript + React, built by Vite | Web first, yes. Phase 5 from the same code, no — see [client-stack.md](client-stack.md) |
| `go_router` | React Router | Yes, unchanged |
| Riverpod | TanStack Query for server data, React Context for the session | Yes — the reason given was explicit loading/error/data, which TanStack Query gives |
| Material, restyled | Radix UI, styled from tokens | Yes — the reason given was accessibility, which is exactly what Radix supplies |
| Design tokens as a Dart constants file | `tokens.css` custom properties + CSS Modules | Yes, unchanged |
| `pubspec.yaml` font assets | `@font-face` over the same files, as `.woff2` | Yes, and now actually true — Flutter still pulled Roboto from Google (#51) |
| `flutter_html` for the reader | epub.js inside `<iframe sandbox>` | No — superseded, see the reader section below |

- **Flutter, web target first**, per architecture.md. Desktop and mobile are
  Phase 5 from the same codebase.
  *(Superseded 2026-08-21 — see the table above.)*
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

Component tests over the screens (Vitest + React Testing Library), and a fake
API client so the suite never needs a running backend — the same seam
discipline as the librarian stub. The fake stays hand-written, because it has
to copy the server's surprising rules; MSW covers only the tests that pin the
exact shape of a request on the wire.

**End-to-end tests are now possible, and are part of the scope.** Playwright
drives the golden path through a real browser against a scratch instance. This
could not be done under Flutter — the client painted itself onto a canvas, so
there was nothing in the page to click, which is how issue #50 was found.
`eslint-plugin-jsx-a11y` runs in CI and fails the build on a clickable
`<div>`, the defect the handoff's own gap list complained about.

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

One branch per feature, as in Phase 1. Milestone 1 spans three issues because
its three endpoint groups are unrelated to each other; every other milestone
is one.

| # | Milestone | Issue | Status | Notes |
|---|---|---|---|---|
| 0 | Close the six design gaps | — | ✅ | [client-design.md](client-design.md) — tokens restored, six surfaces, plus loading/error/empty conventions |
| 1 | Notes endpoints | #21 | ✅ | Over the table Phase 1 defined for exactly this — no migration needed, which was the point |
| 1 | `GET /books/{id}/file` | #22 | ✅ | Filename rebuilt from the catalog by the new `app/naming.py`, shared with Kindle delivery |
| 1 | `DELETE /users/{id}` | #23 | ✅ | Hand-written cascade; no last-admin check, because admin-only plus no self-deletion makes it unreachable |
| 2 | Scaffold | #24 | ✅ | `client/`, tokens → Dart, bundled fonts, `go_router` shell, sidebar with its new pinned footer, Riverpod, skeleton/error/empty primitives, CI analyze + test. No `ThemeExtension` — see below |
| 3 | API client + auth | #25 | ✅ | Typed client, credentialed cookies, fake-client seam, login, session expiry, route guards, account row and dropdown, sign-out, Kindle address modal |
| 4 | Library grid + search | #26 | ✅ | `#tag` autocomplete, OR/AND semantics, the shelf filter pill, gradient cover fallback, empty and first-run states. Sidebar shelf/tag filter lists landed here too — they are filters over this grid |
| 5 | Book detail | #27 | ✅ | View and edit modes, rating, progress, move-to-shelf, lightbox, notes, the two-row action split, download, Send to Kindle with all five of its states. Edit Book is admin-only — see below |
| 6 | Shelves page + shelf manager | #28 | ✅ | Real drag-reorder, visibility control and its pill, shared-shelf section in both sidebar and page. Needed `owner_username` on `ShelfRead` — see below |
| 7 | Tag manager | #29 | | Shared / Mine split, `editable` respected, name-hashed colour swatches |
| 8 | Add Book | #30 | | Upload-first redesign |
| 9 | User administration | #31 | | Admin-only modal, per-row commits, destructive delete dialog |
| 10 | Librarian chat, stubbed | #32 | | `Conversation`/`Message` tables and migration, service seam, screen, streaming, citations, stub badge |
| 11 | EPUB chapters and resources | #35 | | `epub.read_spine`, chapter and resource endpoints — the parse Phase 2's chunker also needs |
| 12 | In-browser reader | #36 | | epub.js in a sandboxed iframe over the spine, TOC, scroll position written back as progress |

**Milestones 0 to 6 were built in Flutter and are rewritten in TypeScript**,
which is the three-week timebox in [client-stack.md](client-stack.md).
Milestones 7 to 10 and 12 are built once, in the new client, and were never
started in Flutter. Milestone 11 (#35) is backend work and is untouched by the
move. The milestone numbers, scope and dependencies below are unchanged.

The three milestone-1 issues and #24 are independent of everything; #25 gates
every client milestone after it; #27 additionally waits on #21 and #22, and
#31 on #23. Nothing else has a dependency, so 4 and 6–10 can be built in any
order once #25 lands.

**Milestone 3 is what the reordering was for.** It is the first time anything
has reached this API from outside the process, so cookie handling, CORS and
every response shape get their first real test there. Expect it to find
things; that is the point.

What it actually found, now that it is done:

- **The backend was fine.** Login, `/auth/me`, `PATCH /users/{id}`, the
  `SameSite=lax` cookie and the credentialed CORS preflight all worked
  first time against a real browser on a different origin. The one operational
  requirement is that `LIBRA_CORS_ORIGINS` name the client's origin exactly;
  recorded in [client README](../../client/README.md) because a blocked
  preflight is indistinguishable from an unreachable server.
- **The cold-load window needed its own route.** Letting a protected route
  match while the session is still unknown mounts the shell for someone who may
  not be allowed it, then tears it down — which churns the shell navigator's
  `GlobalKey`, and from milestone 4 would fire every screen's initial load
  before anyone knows whether there is a session. Redirecting to `/login`
  instead would flash the login card on every refresh. Hence `/starting`, which
  carries the intended destination through as `?next=`.
- **The fire-once expiry rule needed a sharper test than "count the
  notifications".** `SessionState`'s anonymous value is `const`, so repeated
  assignments hand Riverpod the same canonical instance and get coalesced for
  free — a broken guard passed a notification-counting test. The test now asks
  each concurrent 401 whether *it* was the one that ended the session.

**Milestone 2 dropped the `ThemeExtension`.** It was going to hold the tokens
Material has no slot for — `accentHover`, `accentLighter`, `coverBg` — but the
design is a single fixed palette with no dark mode drawn, and theming is not a
project goal. With no second implementation behind it, the extension would only
re-expose `LibraColors` through a context lookup: indirection for its own sake,
the same thing as the redundant tag filter deleted in #9. Widgets read the
token classes directly, and `lib/theme/theme.dart` records where an extension
goes if a second palette is ever designed.

The collapsible SHELVES / SHARED WITH YOU / TAGS sections of the sidebar are
**not** stubbed by milestone 2. They are #28 and #29, they need real data, and
an empty section carrying invented copy would be harder to replace than
nothing. Milestone 2 owns the frame: logo, primary nav, and the pinned footer.

**Milestone 4 then took the SHELVES and TAGS lists**, because gap 4 makes them
filters over the library grid rather than links to a management screen — they
belong to whoever owns the grid. #28 and #29 keep the Shelves page, the SHARED
WITH YOU section, and both manager modals.

Two decisions worth recording from milestone 4:

- **The library moved to `/library`**, with `/` redirecting, so the filter can
  live in the query string. A filtered view is then linkable, survives a
  reload, and comes back with the back button — and the screen holds no filter
  state of its own.
- **Automatic provider retry is off.** Riverpod 3 retries a failed provider
  indefinitely with backoff. The design specifies an error block with a "Try
  again" button, and an invisible retry racing it is two mechanisms for one
  job: the error flickers in and out and the reader cannot tell whether their
  click did anything. Failure is reported once; retrying is the reader's call.

**Milestone 5 found the first real client/server disagreement**, and it is
worth recording because the same shape will recur.

`PUT /books/{id}/state` is a **hybrid**. `shelf_id` and `tag_ids` are guarded
by `exclude_unset`, so omitting them leaves them alone. `rating` and `progress`
are read straight off the parsed body, where they default to zero — so omitting
either *sets it to zero*. The client initially treated all four as partial, and
a rating click silently erased how far the reader had got. The endpoint is
self-consistent and documented; the client simply did not match it.

Two things follow:

- `LibraApi.setState` now **requires** `rating` and `progress`, so a partial
  write of those two is not expressible. The signature is shaped to the
  endpoint rather than to look tidy.
- **The fake was wrong in the same way**, which is why no test caught it. A
  fake that does not model the server faithfully converts an integration bug
  into a passing suite. `FakeLibraApi` now mirrors the hybrid exactly, and
  `test/api/http_libra_api_test.dart` drives the real client against a mock
  transport to pin the wire format — the layer the fake, by construction,
  cannot cover.

**Milestone 6 needed one backend field.** The design labels somebody else's
public shelf "by {username}", but `ShelfRead` carried only `owner_id` and
`GET /users` is admin-only — so an ordinary reader could not turn that id into
a name, and every shared shelf would have read as anonymous. `ShelfRead` now
carries `owner_username`, filled in one query rather than one per shelf.
Publishing a shelf is a deliberate act that already discloses its owner to
every reader on the instance, so there is nothing new exposed.

The same milestone corrected the login screen's expiry copy. It was inferred
from `?next=`, which records where the reader was *going* rather than why they
are at a login screen, and the two come apart in both directions: a shared link
followed while signed out carried `next` and falsely claimed a session had
ended, while an expiry on the library carried no `next` and said nothing at
all. The session now records the one moment a live session ends, and the screen
reads that.

**Edit Book is admin-only.** `PATCH /books/{id}` is `require_admin`, because
title and author describe the shared catalog. The design drew the button
unconditionally; showing it to a reader would open a form whose Save is
guaranteed to 403, so it is hidden instead. The form still handles a 403 for
the case of an admin demoted while it is open — the hidden button is a
courtesy, the endpoint is the guard.

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
