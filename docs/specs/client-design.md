# Client Design — Tokens and the Undesigned Surfaces

**Status:** Active. Written 2026-08-09. Closes milestone 0 of
[phase-4-plan.md](phase-4-plan.md).

The original handoff specified five screens to a high standard and stopped.
This document is the rest: the design tokens (restored here so they are not
only in git history), the six surfaces the handoff never drew, and the
loading/error/empty conventions it explicitly declined to invent.

Written to the handoff's standard — exact values, every state named — because
the reason those five screens were straightforward to build is that they left
nothing to improvise. A chat screen invented in Flutter while everything else
follows a design system will look like the afterthought it was.

**Where the original spec still governs**, it governs: this document adds and
amends, it does not restate. The five original screens are described in
[library-organization.md](library-organization.md) and in the handoff bundle,
recoverable with `git checkout 9b1b423 -- docs/design_handoff_libra/`.

---

## Design tokens

Restored from the handoff. Milestone 2 turns these into a Dart constants file
plus a `ThemeExtension`; this table is the source.

### Colors

| Token | Hex | Usage |
|---|---|---|
| `bg` | `#f7f5f2` | Sidebar background, input fills, inset panels |
| `card` | `#ffffff` | Main content pane, modal surfaces |
| `border` | `#e8e4df` | All 1px borders, dividers, empty progress track |
| `text` | `#2a2520` | Primary text, headings |
| `textMid` | `#6b6259` | Secondary text, labels, inactive nav |
| `textLight` | `#a39a8e` | Tertiary text, metadata, placeholders, icons |
| `accent` | `#8b5e3c` | Primary actions, active states, progress fill, stars |
| `accentHover` | `#7a5030` | Primary button hover — an independent token, never derived |
| `accentLight` | `#f0e8df` | Active nav background, tag pill background |
| `accentLighter` | `#f8f3ed` | Row hover background, inline edit field background |
| `coverBg` | `#e8e4df` | Cover placeholder fallback |
| `danger` | `#c44` | Destructive icon hover, error accents |

Selection highlight: `::selection { background: #8b5e3c33 }`.

### Typography

**Serif** — `Instrument Serif`, weight 400 only. Logo, page titles, book
titles on covers, shelf names, modal headings.
**Sans** — `DM Sans`, weights 400/500/600/700. Everything else.
Both bundled as assets, never fetched.

```
Logo                28px serif, letter-spacing -0.5
Page title (h1)     30px serif, letter-spacing -0.5
Detail title (h1)   34px serif, letter-spacing -0.5, line-height 1.15
Modal heading       22-24px serif
Shelf name          22px serif
Body / input        14px sans 400
Button label        14px sans 500-600
Card title          13px sans 600, line-height 1.3
Field label         12px sans 600, color textMid
Section label       11px sans 700, uppercase, letter-spacing 1.2, color textLight
Metadata            11-13px sans 400, color textLight
```

### Spacing, radius, shadow

```
Content pane padding      28px 36px
Sidebar padding           28px 16px
Sidebar width             240px (fixed, flex-shrink 0)
Standard radius           8px
Modal radius              12px
Cover radius              4px
Pill radius               20px
Grid gap (library)        28px
Shelf row gap             20px

Cover shadow (rest)   2px 4px 12px rgba(0,0,0,.12), 0 1px 3px rgba(0,0,0,.08)
Cover shadow (hover)  3px 8px 20px rgba(0,0,0,.18)
Modal shadow          0 24px 80px rgba(0,0,0,.2)
Dropdown shadow       0 8px 24px rgba(0,0,0,.12)
```

### Transitions

```
Color / border / background   .15s
Row hover background          .12s
Cover lift                    .2s
Progress bar width            .3s
Chevron rotate                .2s
Modal enter                   .25s ease-out   opacity 0→1, translateY(12px) scale(.98)→none
Dropdown enter                .15s ease-out   opacity 0→1, translateY(4px)→none
```

### Viewport

Designed for **≥1280px**. Degrades acceptably to **1024px** — the book detail
action row splitting into two rows (below) is what makes that width work.
Below 1024px the layout is undefined; the handoff's desktop-only stance
stands, and mobile is a Phase 5 design problem.

### Icons

Feather/Lucide-compatible, `fill="none"`, `stroke="currentColor"`, stroke
width 1.5–2, round caps. The handoff needs: grid, shelves, tag, plus,
chevron down/up/left, search, upload, pencil, trash, ×, star.
**These surfaces add:** message-square, user, log-out, eye, send, book-open,
rotate-cw, check, alert-circle.

---

## New furniture: the sidebar account area

Gaps 1 and 2 both hang off something that does not exist — **the handoff's
sidebar has no account area and therefore nowhere to sign out.**

The sidebar becomes a three-part vertical flex instead of one column with
`margin-top: auto` on Add Book:

1. **Scrollable middle** — logo, primary nav, Shelves, Shared, Tags sections.
2. **Pinned footer** — 1px `border` top, 12px top padding: the Add Book
   button, then the account row 8px below it.

The footer never scrolls. Sign-out must be reachable without hunting.

**Primary nav gains a third row: "Librarian"**, message-square icon, placed
below Shelves. Same 10px/12px padding, 8px radius, active/inactive treatment
as the others.

**Account row** — 10px/12px padding, 8px radius, `accentLighter` on hover,
full width, 10px gap:
- 28px circular avatar, `accentLight` fill, `accent` text, 13px sans 600,
  holding the username's first character uppercased.
- Username, 13px sans 500 `text`, truncated with ellipsis at one line. Beneath
  it, "Admin" at 11px `textLight` when `is_admin` — otherwise nothing, so the
  row is single-line for ordinary readers.
- A 14px chevron-up, right-aligned, `textLight`.

**Account dropdown** — opens **upward**, exactly like Move to Shelf:
`bottom: 100%`, 6px gap, min-width 200px, `card` fill, 1px `border`, 8px
radius, 4px padding, dropdown shadow, dropdown-enter animation. Rows are
8px/12px, 13px `text`, 4px radius, `accentLighter` on hover:

1. **Kindle Email…** — opens the Kindle address modal (below).
2. **Manage Users** — *rendered only when `is_admin`*.
3. 1px `border` divider, 4px/8px margin.
4. **Sign Out** — 13px `textLight`, log-out icon at 12px. Calls
   `POST /auth/logout`, clears client state, routes to `/login`.

Closes on outside `pointerdown`, on Escape, and on selecting a row.

**Kindle Email modal** — 400px wide, otherwise the Manage Tags shell. Heading
"Kindle Email" (22px serif). One 42px field, label "Send-to-Kindle address",
placeholder `you_a1b2c3@kindle.com`, prefilled from `kindle_email`. Helper
line at 11px `textLight`: "Add libra's sender address to your Approved
Personal Document E-mail list, or Amazon will reject the delivery." Footer:
Cancel and Save. Writes `PATCH /users/{self}`.

That helper line is not decoration — it is the single most common reason a
delivery silently fails, and it was learned the hard way during Phase 1.

---

## Gap 1 — Login and session expiry

### Login screen

Route `/login`. No sidebar; the whole viewport is `bg`.

A single card, centered both axes: 380px wide, `card` fill, 12px radius, 40px
padding, dropdown shadow (`0 8px 24px rgba(0,0,0,.12)` — modal shadow is too
heavy for a page with nothing behind it).

- **"Libra"** — 34px serif, letter-spacing -0.5, `text`, centered, 32px
  bottom margin. No tagline; the app does not need to sell itself to a
  household.
- **Fields**, 18px apart. Each: a 12px sans 600 `textMid` label, 6px gap, then
  a 42px input — 8px radius, 1px `border`, `bg` fill, 12px horizontal padding,
  14px sans. Border → `accent` on focus.
  - Username, `autofocus`.
  - Password, obscured. No reveal toggle.
- **Submit** — full width, 42px, `accent` fill, white, 14px sans 600, 8px
  radius, 24px top margin. Hover → `accentHover`. While either field is empty:
  `border` fill, `textLight` label, default cursor, submit is a no-op —
  matching the Add Book modal's disabled treatment exactly.
- **Enter submits** from either field.

**Error** — on a rejected login, an inline line appears between the fields and
the button: 13px `danger`, alert-circle icon at 14px, 12px top margin. The
copy is **"Incorrect username or password."** and it never distinguishes
which. That is not vagueness for its own sake: `auth.authenticate` verifies
against a dummy hash for unknown users specifically so response timing does
not reveal whether an account exists, and a design that says "no such user"
would hand back what the backend spends effort concealing.

**No** "remember me", "forgot password", or "create account" links.
Self-registration and password reset are explicit non-goals in
[architecture.md](../architecture.md); offering dead affordances is worse than
offering none.

### Session expiry

**Any 401 from any request** clears client auth state and routes to
`/login?next=<encoded current route>`.

When `next` is present, a line sits above the fields: **"Your session expired.
Please sign in again."** — 13px `textMid`, centered, 20px bottom margin. On
success, the client routes to `next` rather than `/library`.

Unsaved form state is lost. That is the accepted cost: sessions are
long-lived on a household instance, and the alternative — a re-auth modal
that replays the failed request — is a queue and a retry policy for a case
that should be rare.

**This is the one thing to test hard.** It is the only state the whole
application shares and the only one that appears without a user action. The
test that matters is not "a 401 redirects" but "a 401 during a *background*
refresh, while the user is typing in a modal, redirects exactly once" — a
naive implementation fires one redirect per in-flight request.

---

## Gap 2 — User administration

Admin only, reached from the account dropdown. **Manage Users modal**, 520px
wide (wider than Manage Shelves' 460px because rows carry more), otherwise
structurally identical: 28px/28px/20px padding, max-height 80vh, column flex
with a scrolling middle.

**Header** — "Manage Users" (22px serif), "N users" beneath (12px
`textLight`), 32px circular × button.

**Add row** — not a single input, because creating a user needs three fields.
A full-width dashed button, "+ Add User", 1.5px dashed `border`, 13px
`textMid`, hover → `accent` on both. Clicking expands an inline form in place
(same 8px radius, `bg` fill, 14px padding): Username, Password, and an
"Administrator" checkbox, then right-aligned Cancel and Create. Collapses on
either.

**Rows** — 10px/8px padding, 1px `border` bottom, 10px gap:
- 28px circular avatar, as the sidebar's.
- Username, 13px sans 500 `text`. Beneath, `kindle_email` at 11px
  `textLight`, or "No Kindle address" in italic when null.
- "Admin" badge when applicable — 11px `textLight` on `bg`, 2px/8px padding,
  10px radius. (The same badge treatment as the shelf book-count.)
- Pencil edit button, 14px, `textLight` → `accent`.
- Trash delete button, 14px, `textLight` → `danger`.

**Edit** expands the row into a form: Kindle address field, an Administrator
checkbox, and a "Set new password" field left blank (blank = unchanged).
Save and Cancel at 7px/14px with 12px labels.

**Writes commit per row, immediately** — unlike Manage Tags and Manage
Shelves, which batch behind a Save Changes footer. Those batch because
deleting a tag or shelf has to reconcile against every book; users have no
such cross-row dependency, and a batched "grant admin to three people" that
half-fails leaves an admin unable to tell what took effect. The footer
therefore holds a single **Close** button.

**Delete** raises a destructive confirm dialog — a real dialog, never the
native `confirm()` the prototype used. 420px, 12px radius, modal shadow.
Heading "Delete {username}?" (22px serif). Body at 13px `text`,
line-height 1.5, stating exactly what the backend does:

> Their shelves, personal tags, reading progress, notes, and sessions are
> deleted. Books they uploaded stay in the library.

Footer: Cancel (outlined) and **Delete** (`danger` fill, white label). This
needs `DELETE /users/{id}`, added in milestone 1 — the behaviour was already
specified in [library-organization.md](library-organization.md) decision 10;
only the endpoint was missing.

**Self-protection:** an admin's own row shows no trash button, and the API
must refuse it too. A design that hides the control is a courtesy; the
endpoint refusing is the actual guard.

---

## Gap 3 — Shelf visibility

`Shelf.visibility` is `private` (default) or `public`. Public means every
reader on the instance can see the shelf and its books, and none of them can
change it.

**In the Manage Shelves modal**, the row gains a marker but not a control:
a **"Public"** pill after the name — 11px sans 600, `accent` on
`accentLight`, 2px/8px padding, 10px radius, with a 12px eye icon. Private
shelves show nothing. Private is the default and the common case; labelling
every private shelf would be noise, and the asymmetry is the point — the
pill marks the shelf that is *not* the norm.

**The control lives in the row's edit state**, below the name input: a
checkbox row, "Visible to other readers", 13px sans `text`. When checked, an
explanation appears at 11px `textLight`, 6px below:

> Anyone with an account can see this shelf and the books on it. Only you can
> change it.

Publishing is the only action in the app that exposes something to another
person, so it gets a sentence rather than a bare toggle.

**On the Shelves page**, a public shelf's name is followed by the same pill,
baseline-aligned between the 22px serif name and the "N books" count.

---

## Gap 4 — Other people's public shelves

`GET /shelves` already returns the caller's own shelves in their chosen order
followed by others' public ones, with `editable` marking the difference. The
design just needs somewhere to put them.

**Sidebar** gains a third collapsible section, **"SHARED WITH YOU"**, between
Shelves and Tags — same section-label + rotating-chevron pattern, 28px top
margin. Each row is the shelf name at 13px `textMid` with the owner's
username beneath at 11px `textLight`.

Two deliberate differences from the sections above it:
- **Collapsed by default**, where Shelves and Tags are open. It is secondary.
- **Hidden entirely when empty** — no zero state. On a single-user instance,
  which is the common case, the section simply does not exist.

**Shelves page** gains a matching group: after the user's own shelf blocks, a
`SHARED WITH YOU` section label, then the same blocks with "· by {username}"
appended to the shelf name at 13px `textLight`. Hidden when empty. Shelves
from others carry no edit affordances anywhere.

### Sidebar shelf clicks now filter the library

The prototype's handler ignored its argument — clicking a shelf just opened
the Shelves pane. It now routes to **`/library?shelf=<id>`**, using the
`shelf_id` parameter `GET /books` already supports.

This makes the sidebar coherent: **shelves and tags are both filters over one
grid**, and the Shelves page is the visual browse view. It also makes shared
shelves useful rather than decorative — the point of seeing someone's shelf
is reading what is on it.

**The Library page's filter summary extends to carry it.** The handoff's
summary reads "Filtered by:" plus solid `accent` tag pills and a trailing
italic "(OR)". A shelf filter renders as a *first* pill, visually distinct —
`accent` outline, `card` fill, `accent` text, with a 12px shelves icon and a
12px × to clear it. The distinction matters because the semantics differ:
**the shelf filter ANDs**, while tag pills OR each other. The "(OR)" hint
stays attached to the tag group only.

---

## Gap 5 — The librarian chat

Route `/chat`. Sidebar nav row "Librarian".

**This screen ships against a stub**, and the whole reason to design it now is
that doing so forces the questions Phase 3 would otherwise answer alone. The
answers are recorded at the end of this section.

### Layout

Content pane, standard 28px/36px padding, no page scroll. Vertical flex:
header, then a scrolling message column, then a pinned composer.

The message column is capped at **720px** and left-aligned — not centered.
Every other page in this app is left-aligned against the sidebar, and a
centered column would read as a different application.

### Header

"Librarian" (30px serif) on the left. On the right, the **stub badge**:

> `NOT CONNECTED` — 11px sans 700, uppercase, letter-spacing 1.2,
> `textLight`, `bg` fill, 1.5px **dashed** `border`, 3px/10px padding,
> 20px radius.

Dashed borders are already this design system's vocabulary for *provisional*
— the Add Book button, the empty shelf, the Add Note button. Reusing it for
"not real yet" costs nothing to learn.

Beneath the header, one line at 13px `textLight`: **"The librarian isn't
connected yet — replies below are canned examples."** Both the badge and this
line are removed in Phase 3, and nothing else on the screen changes.

### Empty state

First visit, 60px vertical padding:
- "Ask about your library" — 22px serif `text`.
- Three suggestion rows, 8px apart, each full column width, 1.5px dashed
  `border`, 8px radius, 12px/16px padding, 13px `textMid`, hover → `accent`
  border and text. They double as the stub's canned-exchange triggers:
  - "What should I read next?"
  - "What are the main themes in {a book from the library}?"
  - "Find me something like {a book from the library}."

### Messages

24px apart.

**Reader** — right-aligned block, max-width 80%, `accentLight` fill, `text`,
13px sans, line-height 1.6, 12px/16px padding, 8px radius.

**Librarian** — full column width, no fill. Preceded by a `LIBRARIAN` section
label (11px sans 700 uppercase, letter-spacing 1.2, `textLight`), 6px gap.
Body 13px sans `text`, line-height 1.6, paragraphs 12px apart.

**Tool-call status** — sits above the reply it belongs to. While running:
14px search icon and 12px sans italic `textLight`, "Searching your library…".
On completion it collapses to a row reading "Searched your library · 3 books"
at 12px `textLight` with a 12px chevron, clickable to expand the titles it
matched.

**Citations** — a referenced book renders inline as a chip: 12px sans 600
`accent`, `accentLighter` fill, 2px/8px padding, 10px radius, 12px book-open
icon, routing to `/books/{id}` on click.

Citations are the strongest argument for designing this screen before Phase 3
rather than after. A RAG answer with no source is not obviously trustworthy,
and threading citations back into already-rendered prose is much harder than
emitting them from the start.

### Streaming

Replies render progressively. A 2px × 14px `accent` caret blinks at the tail
while a reply is in flight, and disappears on completion. The composer's send
button is disabled while a reply streams.

### Errors

Three distinct shapes, because three distinct things go wrong:

1. **Librarian unavailable** — an error card in the message position: `bg`
   fill, 8px radius, 3px `danger` left border, 14px/18px padding. "The
   librarian is unavailable right now." at 13px `text`, then a "Try again"
   button at 12px sans 600 `accent` with a 12px rotate-cw icon. This is the
   same card shape as the detail screen's note quotes, recoloured — one error
   idiom across the app.
2. **Nothing relevant found** — an ordinary reply, no error styling: "I
   couldn't find anything in your library about that." Not a failure, and
   dressing it as one trains the reader to distrust the screen.
3. **Book not indexed** — an ordinary reply naming the book: "I don't have
   {title} indexed yet, so I can't answer questions about its contents."

### Composer

Pinned to the pane bottom, column width, 16px top margin, 8px radius, 1px
`border`, `bg` fill, focus → `accent` border. A textarea auto-growing from
48px to 120px then scrolling, 14px/16px padding, 14px sans, placeholder "Ask
about your library…".

A 32px circular send button sits inside at the right, 8px inset, `accent`
fill with a white 16px send glyph. Disabled — `border` fill, `textLight`
glyph — while the input is empty or a reply is streaming.

**Enter sends. Shift+Enter inserts a newline.**

### Persistence

**One implicit conversation per reader**, persisted and reloaded on each
visit. No history UI, no "new conversation" control in Phase 4 — those are
easy to add once Phase 3 shows whether a conversation is worth keeping, and
hard to remove once a reader has organised around them.

### What this settles for Phase 3

These are the [phase-4-plan.md](phase-4-plan.md) contract questions, answered
by the act of designing the screen:

| Question | Answer |
|---|---|
| Streaming or atomic? | **Streaming**, token-level, with a tail caret. Implies SSE — the transport, not just the widget |
| Tool calls visible? | **Yes** — a live status line collapsing to an expandable summary |
| Citations? | **Yes** — inline chips carrying `book_id`, routing into the catalog |
| Failure modes | **Three**, distinctly styled: unavailable (error card), nothing found (plain reply), not indexed (plain reply naming the book) |
| Persistence | **Yes**, one conversation per user; `Conversation` + `Message` tables land in milestone 10 |

The agent's response format is therefore not free: it must emit text
incrementally, announce tool calls as it makes them, and carry book ids
alongside prose rather than only inside it.

---

## Gap 6 — The book detail action row

The design drew three buttons. With `GET /books/{id}/file` and Send to Kindle
there are four, which does not fit the drawn row at 1024px.

**Two rows, split on meaning** — not wrapped:

**Row 1 — what you do with the book.** 11px/24px padding, 14px sans 600,
10px gap.
- **Primary**, `accent` fill, white, hover `accentHover`. Label keeps the
  handoff's three states: "Start Reading" at `progress == 0`, "Continue
  Reading" between, "Read Again" at 1. It downloads the EPUB via
  `GET /books/{id}/file`.
- **Send to Kindle**, outlined: 1.5px `border`, `card` fill, `textMid`, hover
  → `accent` border and text.

**Row 2 — how you file it.** 12px below row 1, 9px/18px padding, 13px labels,
same outlined treatment.
- **Edit Book**
- **Move to Shelf**, with its 10px chevron and upward dropdown, unchanged.

The split is semantic rather than cosmetic: acting on the book versus
maintaining the record. That reads as a decision instead of a reflow, and it
is what lets the screen survive 1024px.

### Send to Kindle states

The only long-running action in the app, and the one most likely to fail for
reasons outside the app.

- **Idle** — "Send to Kindle".
- **No Kindle address** — disabled (`border` fill, `textLight`), with an
  inline line below the row at 12px `textLight`: "Add a Kindle address in
  your account first." The words "your account" link to the Kindle Email
  modal.
- **In flight** — disabled, 14px spinner replacing the icon, label "Sending…".
- **Sent** — label "Sent" with a 14px check, `accent` border and text, for
  2.5s, then back to idle.
- **Failed** — returns to idle; an inline line appears below the row at 12px
  `danger`: "Couldn't send — {reason}." The reason comes from the API and
  must never contain SMTP credentials or the configured sender password.

**`last_sent_at` is already on `BookRead`** and should be used: when set and
no other state is showing, an 11px `textLight` line below the row reads "Last
sent {relative time}". It is the answer to "did I already send this?", which
is the question a reader actually has.

---

## Conventions the handoff declined to invent

It listed loading states, error states, and the empty first-run library as
undesigned and said to ask before inventing them. Inventing them per screen
is how an application ends up with four spinners and three error shapes, so
they are settled once, here.

### Loading

**Skeletons, not spinners**, for content that is arriving. Spinners are only
for actions the reader initiated, and only inside the control that started
them.

- Library grid — skeleton cells matching the real cell geometry: a `coverBg`
  block at the cover's 1.45 aspect, 4px radius, then two lines at 13px and
  12px heights, `coverBg`, 4px radius, at 80% and 50% width. Render 12 cells.
- Lists (shelves, tags, users) — three skeleton rows at the real row height.
- Book detail — cover block plus title, author and metadata lines.
- Pulse: opacity 1 → .55 → 1 over 1.4s, `ease-in-out`, infinite. One
  animation, shared.

Skeletons appear only after **200ms** of loading. A local-first app on
localhost usually resolves faster than that, and a skeleton that flashes for
40ms reads as a glitch.

### Errors

One shape, everywhere: `bg` fill, 8px radius, 3px `danger` left border,
14px/18px padding. The message at 13px `text`, line-height 1.5, then a "Try
again" button at 12px sans 600 `accent` with a 12px rotate-cw icon where a
retry makes sense.

Placed **where the content would have been** — never as a toast. A toast that
vanishes is unhelpful for something the reader may need to act on, and this
app has no notification region.

### Empty library, first run

Centered in the content pane, 60px vertical padding:
- "Your library is empty" — 22px serif `text`.
- "Add an EPUB to get started." — 13px `textLight`, 8px below.
- The Add Book button, 20px below — and **here alone it is a solid `accent`
  button** rather than the sidebar's dashed one. It is the only thing to do
  on the screen.

This is distinct from the search empty state, which stays as the handoff
specified it: "No books match your search." at 14px `textLight`.

---

## Accessibility

The handoff's gap list ends with accessibility being largely absent — nav
rows, tag rows, shelf rows, dropdown items and autocomplete suggestions were
all `<div onClick>`, and modals had no focus management. That is a defect to
fix, not a style to match, and it is the main reason milestone 2 builds on
Material rather than hand-rolled widgets.

Applying to every surface here:
- Interactive elements are real buttons, focusable and keyboard-activatable.
- Modals trap focus, restore it to the trigger on close, and dismiss on
  Escape. So do the account and Move to Shelf dropdowns.
- The focus ring is a 2px `accent` outline at 2px offset. The handoff left
  this undesigned beyond the browser default; a keyboard user needs it
  visible, and `accent` on this palette carries enough contrast.
- The chat message list is a live region so a streaming reply is announced.
- Every icon-only control — the × buttons, the pencil and trash, the send
  button — carries an accessible label.
