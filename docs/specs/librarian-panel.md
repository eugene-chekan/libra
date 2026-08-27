# Spec: Librarian Panel

**Status:** Design approved 2026-08-28. Not yet built. Covers milestone 10 of
[phase-4-plan.md](phase-4-plan.md) (issue #32), and **replaces** the routing
and layout parts of [client-design.md](client-design.md)'s Gap 5 — see the
note added there. The content design — messages, streaming, tool-call
status, citations, the three error shapes, the composer, one conversation
per reader — carries over unchanged and is not repeated here except where
the panel changes it.

## Why a panel, not a page

Gap 5 designed the librarian as its own page, `/chat`, and considered a
panel instead — rejected at the time for having no design of its own. It
now has one, made on request: leaving whatever page you're reading to ask a
question, then finding your way back, breaks the actual use case — asking
about the book in front of you. A panel that opens over the current page and
closes back onto it keeps you there the whole time.

**This drops the `/chat` route entirely.** The librarian is not a place you
go; it is a layer you open on top of wherever you already are. The
trade-off, accepted on request: there is no address to bookmark or send
someone, which the original route design called out as useful for a
diploma-defense demo. If sharing a conversation turns out to matter, that is
its own, later design question — not solved here by keeping a route this
spec otherwise has no use for.

## Scope

**In scope:**
- The panel itself: opens from a sidebar row, over any page, closes back
  onto it.
- Everything Gap 5 already designed for the chat's content, unchanged:
  empty state, message rendering, streaming, tool-call status, citations,
  the three failure shapes, the composer.
- One rule the panel adds that a page didn't need: clicking a citation
  navigates the page underneath while the panel stays open.
- The backend: `Conversation`/`Message` tables, one migration, and real
  endpoints. Only the reply's *generation* is canned — Phase 3 swaps that
  one step later. This was already the plan before the panel redesign and
  does not change here.

**Out of scope:**
- Anything RAG or agent — retrieval, real generation, ingestion. Phase 2/3.
- RAG management screens (ingestion status, chunk counts, re-index
  triggers) — already ruled out in
  [phase-4-plan.md](phase-4-plan.md#not-built--rag-management); building UI
  for decisions nobody has made yet is inventing requirements.
- Conversation history or a "new conversation" control. One implicit
  conversation per reader, same as Gap 5 already decided — a history UI is
  easy to add once Phase 3 shows whether anyone wants one, and hard to
  remove once someone has organised around it.
- A shareable/linkable conversation. Noted above as the direct cost of
  dropping the route; deliberately not solved here.

## Architecture: where the panel lives

A new `LibrarianProvider`, mounted in `App.tsx` inside `SessionProvider` —
using the librarian requires a session, the same as everything else behind
`RequireSession`. It exposes `useLibrarian()`:

```ts
interface Librarian {
  isOpen: boolean
  open: () => void
  close: () => void
  // the active conversation's messages, streaming state, and the
  // send-message mutation — shaped like every other query/mutation pair
  // in this app, detailed under Data and API
}
```

`AppShell` renders one `LibrarianPanel`, gated by `isOpen`, as a sibling of
`Sidebar` and `<main>` — not inside the `<Outlet />`. That placement is
load-bearing: it is what lets the panel survive a route change instead of
unmounting every time the reader navigates.

`Sidebar`'s existing "Librarian" row (`primaryNav`, `routes.chat`,
`message-square` icon) changes from a `NavLink` to a plain button calling
`open()`. `routes.chat` is removed from `routes.ts`, `primaryNav` loses the
entry, and the row moves into `Sidebar.tsx` directly — the same move
`admin-page.md`'s "Entry point" made for the Admin row, and for the same
reason: `primaryNav` renders every row unconditionally as a `NavLink`, and
this row is no longer either of those things. `ChatScreen` (the
`PendingScreen` stand-in at `web/src/screens/screens.tsx:10-12`) and its
route in `App.tsx` are deleted, not replaced — there is no screen to stand
in for anymore.

## Layout

The panel is a Radix `Dialog.Root`/`Dialog.Portal`/`Dialog.Overlay`/
`Dialog.Content` — the same primitives `Modal` already uses, styled to
anchor right and slide in rather than centered. It does not reuse `Modal`
itself, whose API assumes a centered, width-only card, but it reuses the
same underlying machinery: ESC closes it, clicking the dimmed overlay
closes it, focus is trapped inside while it's open, matching every other
overlay in this app.

**480px wide**, full viewport height, `bg` fill, 1px `border` on the left
edge, sliding in from the right. The overlay behind it dims and blocks
pointer events on the page underneath, same as `Modal`'s overlay — you can
see the page you were on, not click it, until you close the panel.

**Header**: "Librarian" (19px serif) on the left, the `NOT CONNECTED` badge
on the right — same badge spec as Gap 5 (11px sans 700, uppercase,
`textLight`, `bg` fill, 1.5px dashed `border`, 20px radius). Beneath it, the
same explanatory line: "The librarian isn't connected yet — replies below
are canned examples." Both go away in Phase 3; nothing else on the panel
changes.

**Message column and composer**: Gap 5's message and composer specs apply
directly at this width — the 720px cap that section describes no longer
means anything (the panel itself is narrower than that), so drop it; every
other measurement (bubble padding, the `LIBRARIAN` section label, the
citation chip, the composer's auto-growing textarea and send button)
carries over as written.

## Citations navigate underneath

The one interaction Gap 5 didn't have to answer, because a page has nowhere
else to send you: clicking a citation chip while the panel is open
navigates the dimmed page behind it to `/books/{id}` — the panel stays open
on top. This is why the panel has to sit above the router: a citation click
is a real navigation, and the panel must not unmount when it happens.

## Data and API

Unchanged from what [phase-4-plan.md](phase-4-plan.md#the-contract-the-stub-implies)
already settled — the panel redesign doesn't touch this. Restated here
because this is the spec that ships it:

```python
class Conversation(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    title: str | None = None
    created_at: datetime = Field(default_factory=utcnow)

MessageRole = Literal["user", "librarian"]

class Message(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    conversation_id: int = Field(foreign_key="conversation.id", index=True)
    role: MessageRole
    content: str
    created_at: datetime = Field(default_factory=utcnow)
    meta: dict = Field(default_factory=dict, sa_column=Column(SA_JSON))
```

One Alembic revision, `render_as_batch=True` for SQLite, named FKs — the
same gotcha [phase-4-plan.md](phase-4-plan.md#the-contract-the-stub-implies)
already flags: autogenerate emits unnamed FKs, which batch mode rejects.

**The generation step is canned, but it lives server-side**, in a new
`app/librarian.py` mirroring `app/library.py`'s role — the caller's needs
shape the interface, not a route handler. This is what makes Phase 3 a true
swap of one module rather than a client-to-server move: the client only
ever talks to real endpoints.

- `GET /conversations/mine` — the reader's one implicit conversation,
  creating it if it doesn't exist yet, with its messages.
- `POST /conversations/{id}/messages` — persists the reader's message,
  then streams the canned reply as Server-Sent Events (`text/event-stream`,
  via Starlette's `StreamingResponse` — already a FastAPI dependency, no
  new package), writing the completed reply as a `Message` row once the
  stream ends. Tool-call status and citations ride in each chunk's `meta`,
  matching the column above.

The client gets its own `LibrarianService` seam, alongside `LibraApi` and
built the same way — an interface (`getConversation()`, `sendMessage(text):
AsyncIterable<...>`), a fake implementation returning the canned exchanges
Gap 5's suggestion rows trigger, and an HTTP implementation reading the SSE
stream. It stays a separate interface rather than folding into `LibraApi`:
unlike every other write in this app, a send is not a single
request/response, it's a stream, and `LibraApi`'s existing methods are all
one-shot.

## Testing

- `AppShell.test.tsx` gains coverage the route tests used to carry: the
  panel opens from the sidebar row, survives a simulated route change,
  closes on ESC and on an overlay click, and a citation click navigates
  while the panel stays open.
- The content-level test plan Gap 5 already implies — empty state,
  streaming render, tool-call collapse/expand, citation click, the three
  error shapes, blank-vs-filled composer — carries over unchanged, mounted
  inside `LibrarianPanel` instead of a screen.
- `FakeLibrarianService` tests for the canned exchanges, the same shape as
  `FakeLibraApi`'s existing tests.
- Backend: model/migration tests for `Conversation`/`Message`, and tests
  for both endpoints — creating the implicit conversation on first access,
  persisting a sent message, and the SSE stream's shape.
- e2e drops the `/chat`-route assumptions but keeps the golden path: open
  the panel from the sidebar, ask a suggested question, see the reply
  stream in with a citation, follow it, confirm the panel is still open on
  the book page it navigated to.

## Open questions

None blocking.

- **GitHub issue #32's body** still describes the old page design and a
  Flutter-era "Riverpod override" (this project has been TypeScript/React
  since before this issue was filed — see
  [architecture.md](../architecture.md)). Worth updating when this ships,
  the same way this spec supersedes Gap 5's routing section.
- **The exact canned exchanges and their tool-call/citation timing** (how
  long the "searching" state shows, how the reply chunks) — implementation
  detail, not a design question; Gap 5's three suggestion rows already name
  which questions need scripting.
