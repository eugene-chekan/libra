# Phase 4 — Client: Scope and Plan

**Status:** Active. Written 2026-08-09, the day after Phase 1 completed.

The client is built in TypeScript and React, with Vite. The scope, the
milestones and the design below are unchanged from when this plan was
written; only the tools that build the screens changed.

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

*Paths below are written as they were at Phase 1's close. Every one of them
now lives under `/api` — `POST /auth/login` is `POST /api/auth/login`, and so
on — with `/health` the only exception. See
[architecture.md](../architecture.md) for why, and the OpenAPI schema
(`/docs`) for the current list.*

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

**Why it is worth a milestone.** The download button was going to be labelled
"Start Reading" and deliver a file to a Downloads folder, and the panel above
it was going to show a progress bar the reader had to move by hand. Both are
the same defect: the application asking to be told something it could observe.
A reader makes `progress` a fact rather than a claim, which is worth more than
the feature itself.

**The reader needs nothing new from the server.** This replaces an earlier
plan for chapter and resource endpoints, and it is why milestone 11 was
dropped. The client fetches the whole book from `GET /books/{id}/file`, which
already exists, and epub.js unzips and parses it in the browser. It resolves
in-archive images and stylesheets by itself, rewriting each one to a `blob:`
URL, so nothing has to serve them. Phase 2 still parses in Python, because the
chunker runs server-side — but that is one hand-written parser plus a library,
not two copies of ours that can drift.

The cost is that the whole file downloads before the first page. For a
self-hosted library on a home network that is the right trade; it would not be
for a public service.

**Why the reader is safe.** Book markup comes from an uploaded file and is
served from an origin carrying a session cookie, so putting it straight into
the page's DOM is stored XSS — the hazard `cover_for`'s media-type allowlist
already exists to prevent. epub.js renders each chapter into an iframe it
marks `sandbox="allow-same-origin"`, leaving `allow-scripts` off. **The
protection is that no JavaScript executes, not that the origin differs.**
Verified rather than assumed: a book carrying an inline `<script>` and an
`<img onerror=...>` renders, both survive into the iframe's DOM, and neither
runs. A second and independent layer is that `libra_session` is `HttpOnly`, so
a script that did run still could not read it.

**epub.js will not render in a hidden tab.** Its renderer waits on
`requestAnimationFrame`, which browsers never fire while `document.hidden`.
The call does not fail — it hangs forever with no error and no iframe. Worth
knowing before it is rediscovered as a bug.

**Scrolling, not paginated.** Reflowed pagination with real page numbers is a
project of its own and is not attempted. Progress is
`(spine_index + scroll_fraction) / spine_count`, which fits the existing
`0..1` float — no schema change, and no CFI-style locator to design. The
Reading Progress panel therefore leads with a percentage and shows
"≈ page N of M" only where `pages` happens to be known.

**Accepted limitations**, stated here rather than discovered at defence: the
book's own stylesheet is applied, but fixed-layout titles and anything relying
on complex typography are not a target — this is a reader for prose; and a
very large book is slow to open, because the whole archive is fetched before
the first page.

## The stub boundary

Three conditions, without which the stub rots instead of paying off.

**One swappable seam.** A single `LibrarianService` interface with a fake
implementation returning canned exchanges, injected exactly the way the real
one will be. If faking leaks into components, the eventual swap becomes a
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
about is that the design left little to improvise; a chat screen invented
without the same rigor would look like the afterthought it was.

The design tokens are not in the working tree — the bundle was removed once
the specs superseded it. Recover with
`git checkout 9b1b423 -- docs/design_handoff_libra/`.

## Technical decisions

Each of these answers a question about the product, not about the framework —
should routes be real, should fonts be local, how should state be shaped.

- **Real routes** — `/library`, `/shelves`, `/books/:id`, `/chat` — via React
  Router. The prototype switched a `page` string; the handoff explicitly asks
  for routable, linkable pages and a working back button.
- **Design tokens** live in `tokens.css` as CSS custom properties, with CSS
  Modules for component-scoped styling.
- **Fonts bundled, not fetched.** Instrument Serif and DM Sans ship as local
  `.woff2` files. A local-first application that needs the network to render
  text is a contradiction that would not survive review.
- **Radix UI as the substrate, restyled** — not hand-rolled components. The
  handoff's own gap list says accessibility is largely absent and must be
  rebuilt properly: real buttons, focus management, real dialog behaviour.
  Radix supplies all of that with no styling attached, so restyling from
  tokens is the only work left.
- **TanStack Query** for server data, **React Context** for the session. Two
  properties decide it: async state arrives as an explicit
  loading/error/data value, which matters because the handoff leaves loading
  and error states undesigned and they would otherwise be improvised per
  screen or forgotten; and swapping the API client for a fake is a one-line
  override, the same seam discipline the librarian stub needs.
- **The chat gets its own `/chat` route**, not a panel over the library. A
  panel is arguably the better product — the library stays visible while the
  agent discusses it — but it is the larger design invention, needing a
  dismissal model, a width, and a defined relationship to the grid behind it.
  There is no design for either. A route is linkable for a demo, and can
  become a panel in Phase 3 if it earns it.
- **Auth is a cookie.** The client must send credentialed requests, and
  `LIBRA_CORS_ORIGINS` must name its origin exactly: credentialed CORS cannot
  be combined with a `*` origin. Expect this to be the first thing that
  breaks.

## Testing

Component tests over the screens (Vitest + React Testing Library), and a fake
API client so the suite never needs a running backend — the same seam
discipline as the librarian stub. The fake stays hand-written, because it has
to copy the server's surprising rules; MSW covers only the tests that pin the
exact shape of a request on the wire.

**End-to-end tests are part of the scope.** Playwright drives the golden path
through a real browser against a scratch instance.
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
discipline — unknown fields are ignored on parse. Pulling conversion forward
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

| # | Milestone | Status | Notes |
|---|---|---|---|
| 0 | Close the six design gaps | done | [client-design.md](client-design.md) — tokens restored, six surfaces, plus loading/error/empty conventions |
| 1 | Notes endpoints | done #21 | Over the table Phase 1 defined for exactly this — no migration needed, which was the point |
| 1 | `GET /books/{id}/file` | done #22 | Filename rebuilt from the catalog by `app/naming.py`, shared with Kindle delivery |
| 1 | `DELETE /users/{id}` | done #23 | Hand-written cascade; no last-admin check, because admin-only plus no self-deletion makes it unreachable |
| 2 | Scaffold | done #57 | `web/`, tokens as CSS custom properties, bundled fonts, React Router shell, sidebar with its pinned footer, skeleton/error/empty primitives, CI lint + test |
| 3 | API client + auth | done #61 | Typed client, credentialed cookies, fake-client seam, login, session expiry, route guards, account row and dropdown, sign-out, Kindle address modal |
| 4 | Library grid + search | done #63 | `#tag` autocomplete, OR/AND semantics, the shelf filter pill, gradient cover fallback, empty and first-run states. Sidebar shelf/tag filter lists landed here too — they are filters over this grid |
| 5 | Book detail | done #65 | View and edit modes, rating, progress, move-to-shelf, lightbox, notes, the two-row action split, download, Send to Kindle with all five of its states. Edit Book is admin-only — see below |
| 6 | Shelves page + shelf manager | done #68 | Drag-reorder, visibility control and its pill, shared-shelf section in both sidebar and page. Needed `owner_username` on `ShelfRead` — see below |
| 7 | Tag manager | done #29 | Shared / Mine split, `editable` respected, name-hashed colour swatches, and the no-spaces rule stated on the name field. Commits per row rather than a batch Save — see below |
| 8 | Add Book | done #30 | Upload-first redesign |
| 9 | User administration | done #31 | Full `/admin` page with a tab shell, not a modal — per-row commits, destructive delete dialog |
| 10 | Librarian panel, stubbed | done #32 | `Conversation`/`Message` tables and migration, service seam, SSE streaming, citations. Shipped as a panel over any page, not a `/chat` screen — see [librarian-panel.md](librarian-panel.md) |
| 11 | EPUB chapters and resources | dropped #35 | Not needed. epub.js reads the archive in the browser and resolves its own resources, so the reader wants no new endpoint. `epub.read_spine` moves to Phase 2, whose chunker is now its only caller — see "The in-browser reader" |
| 12 | In-browser reader | open #36 | epub.js over the whole file from `GET /books/{id}/file`, TOC, scroll position written back as progress — designed in [reader-screen.md](reader-screen.md) |

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
  recorded in [web README](../../web/README.md) because a blocked
  preflight is indistinguishable from an unreachable server.
- **The cold-load window needs to render nothing, not redirect.** Redirecting
  to `/login` while the session is still unknown flashes the login card on
  every refresh, even for someone who turns out to be signed in.
  `RequireSession` (`web/src/session/RequireSession.tsx`) renders nothing in
  place — same URL, no navigation — until the session resolves, then renders
  the real screen. No dedicated route is needed for the window.

**Milestone 4** took the SHELVES and TAGS lists, because gap 4 makes them
filters over the library grid rather than links to a management screen — they
belong to whoever owns the grid. #28 and #29 keep the Shelves page, the SHARED
WITH YOU section, and both manager modals.

Two decisions worth recording from milestone 4:

- **The library moved to `/library`**, with `/` redirecting, so the filter can
  live in the query string. A filtered view is then linkable, survives a
  reload, and comes back with the back button — and the screen holds no filter
  state of its own.
- **Automatic query retry is off.** The design specifies an error block with a
  "Try again" button, and an invisible retry racing it is two mechanisms for
  one job: the error flickers in and out and the reader cannot tell whether
  their click did anything. Failure is reported once; retrying is the
  reader's call. See `retry: false` in `web/src/queryClient.ts`.

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
  into a passing suite. `FakeLibraApi` now mirrors the hybrid exactly, and a
  wire-format test drives the real client against a mock transport to pin the
  exact request shape — the layer the fake, by construction, cannot cover.

Building milestone 5 also found a second disagreement, this time in a
response rather than a request. `PATCH /books/{id}` returned the table row and
let `response_model` turn it into a `BookRead`. Five of that model's fields
are not columns on `Book` — `rating`, `progress`, `shelf_id`, `has_cover`,
`tag_ids` — so FastAPI filled them from the defaults. A book the caller had
rated five stars and read halfway came back unrated, unstarted, unshelved and
with no cover. `POST /books` already went through `library.get_book` and
already carried a comment warning about exactly this path; `PATCH` had not.
Nothing inside the process could see it, because the response was well formed
and only untrue — it took a screen reading the response back to find it.
Fixed in the same branch, with a test that fails again the moment the fix is
undone.

There is **no progress slider**, because the reader (#36) is what turns
progress into something the application observes rather than something the
reader declares; and `/books/:id/read` is **routed to the same stand-in the
Librarian tab uses**, so the primary button leads somewhere until the reader
ships.

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

What milestone 6 had to answer was the drag. `useDragReorder` is about forty
lines over pointer events, with no drag library: the list is one short
column, and a dependency is a cost that stays long after the screen is done.
Nothing is written until the pointer is released, and only when the order
really changed — a write per row crossed would be one request per pixel of
travel. The up and down buttons beside each row are not a fallback for the
drag. A drag cannot be done from a keyboard at all, so the buttons are the
real control and the drag is the quick way.

That split is visible in the tests. jsdom — the fake browser the component
tests run in — does not answer the question the drag asks it, which row is
under the pointer, so the component tests cover the buttons and
`web/e2e/shelves.spec.ts` covers the mouse. That file is also the first spec
here to run **serial** rather than in parallel. `PUT /shelves/order` rewrites
the whole list, so two tests reordering at the same moment each undo the
other's arrangement.

Delete asks first, in the project's own dialog rather than the browser's
`confirm()`. The prototype used `confirm()`, which cannot be styled, cannot
follow the same focus rules as everything else, and leaves no room for the one
sentence a reader is actually weighing: the books stay in the library.

**Milestone 7 dropped the prototype's Save Changes footer.** The handoff drew
Manage Tags as a batch: edits collected locally, one Save applied them all.
Milestone 6 had already shipped Manage Shelves committing per row, so keeping
the batch here would have made two dialogs that look alike behave differently.
It is also the weaker design, for the reason `client-design.md` already gave
about Manage Users: when one rename is refused after a delete has gone
through, a batch leaves the reader unable to tell what took effect. One write,
one row, one answer.

**The tag dot's colour is hashed from the name, not taken from the row's
position.** The list interleaves global and personal tags in the server's
order, so an index would repaint a tag's neighbours whenever one was added.
The twelve values are the cover palette's first stops, referenced as tokens.

**The sidebar's TAGS section now stays when the reader has no tags**, holding
just the Manage Tags row. SHELVES may disappear when empty because the Shelves
page's empty state is another way to a first shelf; tags have no second door,
so hiding that row would leave a reader with no tags no way to make one.

**Edit Book is admin-only.** `PATCH /books/{id}` is `require_admin`, because
title and author describe the shared catalog. The design drew the button
unconditionally; showing it to a reader would open a form whose Save is
guaranteed to 403, so it is hidden instead. The form still handles a 403 for
the case of an admin demoted while it is open — the hidden button is a
courtesy, the endpoint is the guard.

**Milestones 5 and 7 together left a hole that only using the app found.** The
tag manager curates the vocabulary — create, rename, delete — and milestone 5
had drawn a book's tags as pills that filter the library. Neither built the
control that puts a tag *on* a book: milestone 5's issue said tag editing
belonged to the tag manager, and #29's scope was the vocabulary. So the app
could make a tag and show a tag and never attach one, and the only way to do
it was to call the API by hand.

The fix is [gap 8](client-design.md) — a **+ Add Tag** pill beside the others,
writing `PUT /books/{id}/state` at once, in view mode rather than the
admin-only edit form the prototype drew it in. It is worth naming the shape of
the mistake: both milestones pointed at each other, and neither issue's
checklist had a line that would have failed. A scope written as "what this
screen shows" cannot catch a verb nobody owns.

Two defects came out of the same work, both invisible until something read a
response. `PUT /books/{id}/state` built its answer without the tag ids, so
every write reported a book with no tags — the same omission fixed in
`PATCH /books/{id}` during milestone 5, in the sibling endpoint. And
`FakeLibraApi` let an admin add a global tag while never letting one be
removed, so it disagreed with the server it exists to imitate, which is the
one thing a fake must never do.

**Milestone 8 reused most of the book detail screen rather than rebuilding
it.** The moment `POST /books/upload` returns, the upload is a real book with
a real id — so the confirm step points `MoveToShelfButton` and `BookTags` at
it unchanged, and both write through the same `PUT /books/{id}/state` they
already used on the detail screen. The title/author/year/pages/blurb fields
and their checks moved out of `BookEditForm` into a new `BookFields`, so the
confirm step and the detail screen's edit form run the same rules instead of
two copies that could drift. A reader who is not an admin sees those fields,
but cannot type into them — the same reasoning as "Edit Book is admin-only"
above: `PATCH /books/{id}` would 403, so the box that reaches it is not
offered.

Building it also found a bug component tests cannot see. `Modal`'s card caps
itself at 80vh with no scroll of its own, and the confirm step — cover,
fields, shelf picker, tags — is tall enough to hit that ceiling. In a real
browser the Done button ended up below the visible area, unreachable by
mouse or keyboard; jsdom, which the component suite runs in, does no real
layout, so every one of those tests passed anyway. Only the Playwright spec,
run in an actual browser, caught it. Fixed with the same `.scroller` pattern
`TagManager` already uses: the content between the title and the footer
scrolls on its own, so the footer's buttons stay in place and reachable.

**Milestone 9 grew from a modal into a full page while it was still being
designed.** The original design gap (client-design.md's Gap 2) specified a
Manage Users modal, matching Shelves and Tags. Partway through brainstorming
it, the plan changed: a full-size `/admin` page with a tab shell, room for
database and server settings tabs later, and fine-grained per-user
permissions beyond the `is_admin` boolean — that last part filed as its own
follow-up rather than built here. `docs/specs/admin-page.md` records the
full reasoning; the shipped scope is the page shell plus one tab, Users,
still `is_admin`-boolean-based. The tab bar renders even with one tab in it,
deliberately not a "show it once there are 2+ tabs" conditional — the
second tab, whenever it lands, costs one entry in `AdminLayout`'s `TABS`
array and one route.

One decision worth recording: the Administrator checkbox on a user's edit
row is disabled on the caller's own row, the same courtesy already applied
to the trash button (no self-deletion). Unlike the trash button, this one
is *only* a client-side courtesy — `PATCH /users/{id}` has no backend guard
against an admin removing their own admin status, unlike `delete_user`'s
refusal of self-deletion. Nothing in the shipped UI can reach that state,
but the gap is real for anyone calling the API directly, and is tracked as
its own backend issue (#85) rather than fixed here.

Built via subagent-driven development — nine tasks, each independently
reviewed, plus a final whole-branch review that caught three bugs no
single task's review could see, because each spans files two different
tasks touched: editing your own row updated the users list but left
`SessionProvider`'s cached copy stale, so the account dropdown and Send to
Kindle kept showing the old Kindle address until a reload; the password
fields had no `autoComplete` hint, risking a browser password manager
offering the signed-in admin's own saved credential on a screen whose job
is setting *other* people's passwords; and the shared error line, copied
from `ShelfManager`'s modal-shaped pattern, never cleared on this route,
because a route — unlike a modal — never unmounts to reset it. All three
were fixed and re-reviewed before merge.

## Open questions

None blocking. Milestone 0 settled the outstanding design questions; what
remains is implementation detail:

- ~~**Drag-to-reorder implementation.**~~ Answered by milestone 6: pointer
  events, no library, committing the full order once on release, with the up
  and down buttons beside it. See above.
- ~~**Whether `POST /books/upload` should stream progress.**~~ Shipped in
  milestone 8 with an indeterminate "Uploading…" state and no byte progress —
  `fetch` has no upload-progress event, so a real bar means a second,
  parallel request path (`XMLHttpRequest`) for one call site. Not measured
  against a large file over a slow link, so this is a decision to revisit
  the first time it is actually the complaint, not a closed one.
