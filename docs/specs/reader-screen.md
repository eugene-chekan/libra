# Spec: The Reader Screen

**Status:** Design approved 2026-09-02. Built 2026-09-02. Covers milestone 12 of
[phase-4-plan.md](phase-4-plan.md) (issue #36), and closes
[client-design.md](client-design.md)'s Gap 7, which framed the questions but
left the answers open. Milestone 11 was dropped: a spike proved the reader
needs no new backend endpoint, so this screen is the whole of the remaining
work.

## Why a full takeover, not a screen in the shell

Every other screen sits inside `AppShell`, with the 240px sidebar on the left.
The reader does not. It replaces the whole shell, the way the login screen
already does.

Gap 7 put the reason plainly: 240px of navigation beside a column of prose is
240px of distraction. Reading is the one task in this application where the
application itself is in the way.

The obvious objection is that the librarian lives in the sidebar, so removing
the sidebar removes the librarian. It does not. `LibrarianProvider` is mounted
in [`App.tsx`](../../web/src/App.tsx) **above** the router, which means the
panel is available on every route, inside the shell or outside it. Its trigger
is a plain function call, `useLibrarian().open()`. Any component can make that
call, so the reader carries its own button.

## Scope

**In:**

- A route at `/books/:id/read`, rendered outside `AppShell`.
- epub.js reading the whole book from `GET /books/{id}/file`.
- A slim top bar: back, book title, how far through, contents, text size and
  width, librarian.
- A contents drawer, opening from the left.
- Three text sizes and three page widths.
- Reading progress written back to the server, and resumed on return.
- A `BookReader` seam with a fake, so the screen is testable.

**Out**, and each is a deliberate refusal rather than an oversight: themes,
margin and line-height controls, dictionary lookup, search inside the book,
bookmarks, and annotation from selection. Gap 7 named these and the answer has
not changed.

The one worth revisiting later is **highlight-to-note**, because the `Note`
table and its endpoints already exist, and the passage a reader selects is
exactly what Phase 2 wants to ingest. It is still not in this milestone.

## Routing: where the reader lives

`routes.reader` used to point at a placeholder inside `AppShell`. It moved
out, becoming a sibling of the shell rather than a child of it, and the
placeholder — along with the `PendingScreen` widget that served it, the last
stand-in in the client — is gone:

```
<Route element={<RequireSession />}>
  <Route path={routes.reader} element={<ReaderScreen />} />
  <Route element={<AppShell />}>
    … every other screen
  </Route>
</Route>
```

It stays inside `RequireSession`, because a book is not public. It moves
outside `AppShell`, because the shell is the furniture being removed.

Back goes to the book detail page, not to browser history. A reader who
arrived from a link should still land somewhere sensible.

## Layout

**The measure.** The text is capped and centred rather than filling the
window. This is the one screen in the application where centring is correct,
because the reader's eye is the only thing being aligned to. Everywhere else
content fills its pane. How wide it is, and how that is achieved, is under
"Text size and page width" — it is not a column around the text, for a reason
that matters.

**The top bar.** Always visible, about 48px tall, and the same `bg` as the
page so the chrome sits on the paper rather than on a white strip above it.
Back on the left with a chevron. The book's title in the middle, in the serif face at
14px — smaller than a page title, because it is a label here and not a
heading. Then how far through the book the reader is, as a plain percentage:
the rule below the bar shows it at a glance, and the number answers "how much
is left" without squinting at a 2px line. Three icon buttons on the right:
contents (`list`), text size and width (`type`), librarian
(`message-square`).

Gap 7 asked whether the chrome should fade as you read. It does not. A control
that hides is a control you have to guess at, and the honest version needs a
visible affordance anyway, which spends the space it was trying to save.

**Progress is the bar's own bottom border.** The bar has a 2px bottom edge in
`border`, and the read portion of it is filled in `accent`. This answers Gap
7's "top or bottom edge" question by making it neither: all the chrome sits in
one band at the top, and the bottom of the screen stays clean prose. The fill
animates over `.3s`, the same transition the detail screen's progress bar
already uses.

## The contents drawer

Opens from the **left**, where the sidebar used to be, 280px wide, over the
text rather than pushing it. Entries come from the book's own navigation
document, which epub.js exposes as `book.navigation.toc`.

**Entries are flattened and resolved to spine positions**, and both halves of
that matter on a real book. Contents nest — parts holding chapters — so only
the top level would otherwise be listed, and a nine-chapter book would offer
three entries. And an entry's place in the contents is not its place in the
spine: front matter is usually in no contents list at all, so the third entry
is rarely the third section. Each `href` is resolved through
`book.spine.get()`, and nested entries carry a depth so a part reads
differently from a chapter inside it.

The current chapter is marked with `accentLight` behind the row, the same
treatment the sidebar uses for the active navigation row. Choosing an entry
jumps there and closes the drawer.

It is built on the same Radix Dialog primitives that `Modal` and the librarian
panel already use, so focus trapping, Escape to close, and returning focus to
the button that opened it all come for free rather than being hand-rolled.

## Text size and page width

Three steps each, not sliders: small, medium, large, and narrow, medium, wide.
A slider implies a precision nobody wants and adds a value to validate.

One popup from the `type` button holds both, each in a named group, with the
current choice marked. It stays open while you pick, because width and size
are things you judge by eye and comparing them should not mean reopening the
menu.

**The width is applied inside each chapter, not by the column around it.** The
scrolling element is epub.js's own container, which spans the window — that is
what puts the scrollbar at the window's edge, where a browser normally puts
it, rather than beside a narrow column. The measure is then a `max-width` on
the chapter's own `body`, in `em`, so it holds its width in characters as the
text size changes.

Those rules carry `!important`, which is not decoration: epub.js writes the
body's width, margin and padding as an inline style and recomputes them on
every resize. Without it the measure applies and the centring does not, and
the text reads as a wide column jammed against the left edge.

The choice is a reader preference rather than a fact about the book, so it is
stored in the browser's own `localStorage` — a small store the browser keeps
per site — and applies to every book. It is not sent to the server; there is
no field for it and inventing one is not worth a migration.

## Set like a printed page

The reader should look like a book, not like a web page showing a book. Six
rules, injected into each chapter's own document through epub.js's themes:

- **Paper, not screen.** The reading surface takes the warm `bg` rather than
  white, and the chapters themselves are transparent so the colour comes from
  behind them — a chapter boundary leaves no seam down the page.
- **Warm ink**, `#2a2520`, the same value as the `text` token. It is written
  out rather than referenced, because this stylesheet lands inside the book's
  document, where the application's custom properties do not reach.
- **Justified, with hyphenation on.** This is how prose is set in print, and
  it is what the ragged right edge was missing.
- **Paragraphs indent and do not space.** A printed book indents the run of a
  paragraph instead of leaving a gap; the first after a heading or a break
  starts flush, as it does on the page.
- **Line height 1.7**, and headings left-aligned with hyphenation off, since a
  broken word in a chapter title reads as a mistake.
- **Page margins** top and bottom. In continuous flow these also open the gap
  where one chapter ends and the next begins, which is the break a printed
  book gets for free by starting a new page.

Only the box rules carry `!important`, and only because epub.js writes those
inline. **The typography deliberately does not**, so a book with real opinions
in its own stylesheet still wins. This is a default for books that say
nothing, not a house style imposed over the publisher's.

## The librarian while reading

The button calls `useLibrarian().open()`. The panel then behaves exactly as it
does everywhere else: 480px, anchored right, drawn over the page.

**It covers the right-hand edge of the text, and that is accepted.** At 1280px
the column is centred and the panel takes the right 480px, so roughly the last
180px of each line sits behind it while the panel is open. The alternative —
shrinking the reading area so the column re-centres in what is left — was
considered and rejected: it makes the reader behave unlike every other screen,
and it reflows the text under the reader's eye at the exact moment they are
looking at it.

If it turns out to annoy in use, the fix is a CSS change to the reading area's
width and nothing else. That is cheap enough to defer until there is evidence.

## Loading and errors

**Loading is a skeleton, not a spinner**, following the convention in
client-design.md: prose-shaped lines at the real measure, appearing only after
200ms.

This screen takes one deviation from that convention, and it is worth stating
why. Every other screen reads from a local database and resolves in
milliseconds. This one downloads the entire book first. So after **2 seconds**
a quiet line appears beneath the skeleton in 13px `textLight`, naming what is
happening. Without it a large book looks frozen rather than slow.

**Two errors, and they are deliberately different shapes.**

A failed download — network gone, session expired — uses the standard error
block, with a "Try again" button that re-fetches. Retrying can work, so the
button is there.

A file epub.js cannot parse uses the same block **with no retry button**.
Retrying a corrupt file cannot succeed, and a button that cannot work is worse
than no button. It offers "Back to the book" instead, where Download still
works, so the reader can open the file in something else.

**A missing file is the same shape as a corrupt one**, and this was found by
running the reader against a real server rather than by reasoning about it. A
catalog row can exist with no file behind it — `POST /books` takes a
`file_path` nobody uploaded — and `GET /books/{id}/file` then answers `404`.
Treating that as a failed download offered "Try again" on a shelf that will
always be empty. A `404` is now a permanent failure with its own sentence.

The distinction is written down because the opposite mistake has already been
made once in this project: the librarian panel shipped with a "Try again"
button that did nothing for a day.

## Progress, resume, and the rating trap

**Progress is measured by text, not by chapters.** epub.js walks the book once
and marks a position every thousand characters; `percentageFromCfi()` then
turns where the reader is into a real fraction of the book. It fits the
existing `0..1` float, so there is no schema change.

The first attempt counted chapters — `(spine_index + scroll_fraction) /
spine_count` — and that is wrong in a way worth recording, because it looks
reasonable. It weighs a two-paragraph title page the same as a forty-page
chapter. On a book with eight sections the number went from 0% to 13% in one
step and then sat still however far you read, because only the chapter index
could move it. A title page was one eighth of the progress bar and under one
percent of the reading.

Measuring costs a pass over the book, a second or two on a novel. It runs in
the background once the book is on screen, and until it finishes the number
falls back to the old chapter estimate — the rough answer, for the moment
before the real one arrives. The result is kept in `localStorage` under the
book's id and file size, so a book is measured once rather than on every
open; the size is what stops a reused id handing one book another's
measurements.

It is written on a pause in scrolling, debounced at **1 second**, and once
more when the reader leaves the screen.

**The write sends `progress` alone**, and nothing else. This is worth a
sentence because it was not always safe.
[`PUT /books/{id}/state`](../../backend/app/routers/books.py) used to write
`rating` unconditionally from a field that defaults to `0`, so a write of
`{progress: 0.42}` cleared the reader's stars — and this screen, writing every
few seconds, would have kept them cleared. Issue #89 fixed the endpoint before
this screen was built: all four fields are now left alone when the caller does
not send them.

**Nothing is written until the resume has landed.** Resuming waits for the book
to be measured, and in that gap the reader is sitting at the top of it. Reporting
that position wrote a 0 over the stored one — so Continue Reading destroyed the
place by the act of returning to it, and the next open started from the
beginning. It only showed on a book big enough that measuring outlasted the
one-second write debounce, which is why it looked intermittent.

**Resume** reads `progress` back the other way, through
`cfiFromPercentage()`, and lands within a thousand characters of where the
reader stopped — a paragraph or so, rather than the "right chapter, not the
right sentence" this used to promise. It is the one place exactness is the
whole point, so it waits for the book to be measured instead of landing
nearby and calling it close enough.

## Data and API

No new endpoints. The screen uses three that already exist:

| Call | Purpose |
|---|---|
| `GET /books/{id}` | Title for the bar, and the current rating and progress |
| `GET /books/{id}/file` | The EPUB itself, fetched once and parsed in the browser |
| `PUT /books/{id}/state` | Progress on scroll pause, carrying the rating |

## Testing

**epub.js cannot run in the component tests.** It needs a real iframe, and its
renderer waits on `requestAnimationFrame`, which jsdom — the fake browser the
component tests run in — does not drive. A test that mounted the real thing
would hang rather than fail, which is the worst way for a test to break.

So the reader gets a **`BookReader` interface with a fake**, the same shape as
`LibrarianService`: a small seam naming what the screen needs from a book —
the chapter list, the current position, move to a chapter, set text size — and
a hand-written fake that answers from a fixture. Component tests run against
the fake. The real implementation wraps epub.js and is covered by end-to-end
tests instead.

The fake enforces the same rules the real one does, including the awkward
ones: a book that fails to parse, and a position that resumes into the middle
of a chapter.

**End-to-end**, against a real backend with a real uploaded book: open a book,
see a chapter, open the contents drawer and jump to another chapter, change
the text size, scroll and confirm progress reaches the server, leave and
return and land in the same chapter.

## Accessibility

- Every control in the bar is a real button with an accessible label; three of
  them are icon-only and would otherwise be unreadable to a screen reader.
- The focus ring is the standard 2px `accent` outline at 2px offset.
- The contents drawer traps focus, closes on Escape, and returns focus to the
  button that opened it.
- Arrow keys and Page Up / Page Down scroll the text, so the book is readable
  without a mouse.
- The chapter itself is real text in the page, not an image, so a screen
  reader can read the book.

## What a real book changed

The screen passed 538 component tests, 47 end-to-end tests and a review, and
then failed on the first real book anybody opened. Four defects, all of them
invisible to a fixture, recorded because the pattern matters more than the
fixes.

**One spine item is not a book.** `flow: 'scrolled-doc'` renders a single
spine item and stops. A reader landed on the title page with no way forward,
because scrolling did nothing and the contents drawer does not list front
matter. The reader now uses `flow: 'scrolled'` with the continuous manager,
which stitches sections together and loads the next as you reach it. That is
what "scrolling, not paginated" was always supposed to mean; the first
reading of it was simply wrong.

**A hidden box measures zero.** The reading area carried `hidden` while the
book opened. epub.js measures that element to size the chapter it renders
inside, so every section came out 0px wide: a reader that had downloaded the
book, parsed it, and drawn 20,000px of nothing. The area is now always in the
DOM, with the skeleton laid over it, and `aria-busy` says whether it is
ready.

**The continuous manager ignores a spine number.** `rendition.display(9)`
returns without error and without moving. Sections are addressed by `href`,
which is also what the contents gives us.

**A book file can be cached under an id that now holds a different book.**
Ids are reused after a delete, and the browser will serve a heuristically
fresh copy without revalidating. The fetch asks for `no-cache`, which
revalidates against the ETag — cheap when the book is unchanged, and never
wrong.

**Progress moved a chapter at a time.** The fraction inside the progress formula was measured against epub.js's whole continuous container. That container holds only the sections currently loaded and is resized as they come and go, so it says nothing about where in a chapter the reader is — the percentage only moved when the chapter did, jumping 0 to 13 on a book with eight sections. It is measured against the current chapter's own view now.

**Reporting every scroll event made scrolling stutter.** The adapter called
epub.js's `currentLocation()` on each `scroll` event — which fires many times
a frame, and walks the rendered views every time — and pushed the result into
React state, re-rendering the bar with it. Moves are now reported at most once
an animation frame, and dropped when nothing a caller can see has changed.

**The fakes were the reason none of this was caught.** `FakeBookReader` and
the e2e fixture both described a book whose contents matched its spine one to
one, with no front matter and no nesting — a book that does not exist. Both
now model the awkward shape, and a test names the defect it exists to stop.
This is the third time this project has been bitten by a fake that was kinder
than the thing it stood for; `phase-4-plan.md` records the first two.

## Accepted limitations

- The whole book downloads before the first page. On a home network this is
  fine; it is the cost of needing no server-side parsing.
- The book's own stylesheet is applied, but fixed-layout titles and complex
  typography are not a target. This is a reader for prose.
- The librarian panel covers the right edge of the text while open.
- **epub.js will not render in a hidden browser tab.** Its renderer waits on
  `requestAnimationFrame`, which browsers never fire while the tab is hidden.
  It does not fail; it hangs, with no error. Anything that mounts this screen
  off-screen will look broken for reasons that give no clue.

## Open questions

- Whether the top bar should also show the chapter title next to the book
  title. It is useful and it is more to fit; left until the bar exists and can
  be looked at.
- Whether `progress` should be written when the reader reaches the very end,
  so `finished_at` is set. `set_reading_state` already sets it at `progress >=
  1`, but the formula only reaches exactly 1 if the last chapter is scrolled
  fully to the bottom, which is easy to miss by a pixel.
