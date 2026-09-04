# Spec: The Reader Screen

**Status:** Design approved 2026-09-02, built 2026-09-02, **rebuilt 2026-09-03**
on a paginated engine after the scrolling one proved it could not hold a
reader's place, and **checked by hand against three real books on
2026-09-04** — see "Position, progress, and turning pages" for why, and "What a
real book changed" for what was learned on the way.

That check is part of the work, not a formality: three earlier rounds of this
reader passed every test and were still broken for the person using it. Слон,
Творчество как точная наука and Долгая прогулка were each opened, read ten
pages into, left and returned to four times. All three came back to the same
text, and none of the three moved its stored place by a single character.
Долгая прогулка was read to its last page, which set `finished_at`.

Covers milestone 12 of
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
- Pages, turned with on-screen arrows, the arrow keys, Page Up / Page Down and
  Space. Two facing columns on a wide window, one on a narrow one.
- A contents drawer, opening from the left.
- Three text sizes and three page widths.
- The reader's place written back to the server as an address, and returned to
  exactly on the next visit.
- A `BookReader` seam with a fake, so the screen is testable.

**Out**, and each is a deliberate refusal rather than an oversight: themes,
margin and line-height controls, dictionary lookup, search inside the book,
bookmarks, and annotation from selection. Gap 7 named these and the answer has
not changed.

The one worth revisiting later is **highlight-to-note**, because the `Note`
table and its endpoints already exist, and the passage a reader selects is
exactly what Phase 2 wants to ingest. It is still not in this milestone.

## How this is built

Positioning the reader took 733 lines across two files — `EpubBookReader.ts`
and `ReaderScreen.tsx` — and most of it was compensation: a measurement pass,
addresses rebuilt from percentages, an estimate for when those failed, and
three interacting rules about when a position was safe to save. Each was added
to cover for the one before it. That accumulation was the defect, not any
single rule in it.

Those two files, plus the `BookReader` seam and its fake, are what the rebuild
replaces — about 996 lines of source and the tests that go with them. The bar,
the contents drawer, the appearance menu, every stylesheet and the whole
backend change stay as they are.

So this rebuild is held to a standard the last one was not:

- **One rule, stated once.** If a second rule is needed to cover for the
  first, the first is wrong.
- **The seam says what the screen needs and nothing more.** No percentage
  reaches navigation; no address reaches the progress bar.
- **Delete rather than keep.** Code that guarded against a failure that can no
  longer happen goes, and so does its test.
- **Each file has one job**, small enough to read in one sitting.
- **Every guard is mutation-tested by hand** — broken, the test confirmed
  failing, restored — as `code-style.md` already requires.

If the implementation starts growing a second guard, that is the signal to
stop and question the design rather than add it.

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
Back on the left with a chevron. In the middle, the book's title in the serif
face at 14px — smaller than a page title, because it is a label here and not a
heading — followed by the chapter, in `textMuted` after a thin separator:
*Долгая прогулка · Глава 4*. The book says which book; the chapter says where
you are in it, which is the thing that changes as you read.

The chapter name comes from the book's own contents: the last entry whose
spine position is at or before the one on screen. Books that ship no contents
at all — one in the test library has none — simply show the book title, with
no separator and no empty space where a name would have been. On a narrow
window the chapter is what drops first, then the page count.

Then how far through the book the reader is, twice over: **`p. 47 of 312`**,
and a plain percentage. The rule below the bar shows the percentage at a
glance, and the number answers "how much is left" without squinting at a 2px
line. Three icon buttons on the right:
contents (`list`), text size and width (`type`), librarian
(`message-square`).

Gap 7 asked whether the chrome should fade as you read. It does not. A control
that hides is a control you have to guess at, and the honest version needs a
visible affordance anyway, which spends the space it was trying to save.

**Progress is the bar's own bottom border.** The bar has a 2px bottom edge in
`border`, and the read portion of it is filled in `accent`. It shows nothing
at all until the book has been measured, which takes a second or two: a number
that is honestly unknown is better left blank than guessed at. This answers Gap
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

**The width caps the reading area, and epub.js sizes the columns from it.**
Under pagination the engine works the column widths out from the box it is
given, so the setting belongs on that box rather than inside each chapter.
Narrow gives one comfortable column of prose; wide gives two facing columns
their full measure on a large monitor.

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
- **Page margins** top and bottom, so the text does not touch the edges of its
  column.

**None of these override the book.** They carry no `!important`, so a book
with real opinions in its own stylesheet still wins. This is a default for
books that say nothing, not a house style imposed over the publisher's.

Nothing here touches the width or the columns. Under pagination epub.js
computes those from the size of the reading area and rewrites them on every
resize, so the measure is set on that area instead — fighting the engine for
the same property is what made the old reader's text jam against the left
edge.

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

## Position, progress, and turning pages

**The book is paginated.** epub.js lays each chapter out in columns sized to
the window and shows one screenful at a time — two facing columns on a wide
window, one on a narrow one. Turning a page moves by a whole column, never by
a pixel.

This replaces a scrolling reader that was rebuilt because it could not be made
to hold a reader's place. The reason is one line in epub.js. Its two view
managers position a target in opposite ways:

| manager | how it reaches a target |
|---|---|
| `continuous` (scrolling) | `scrollBy` — a move **relative** to wherever the reader already was |
| `default` (paginated) | `scrollTo` — an **absolute** position, snapped to a page edge |

A relative move lands somewhere different every time, because what it is
relative to keeps changing: the continuous manager also loads and unloads
sections as the reader scrolls, so the height of the page moves underneath
the position being restored. Everything built on top of that — a measurement
pass, addresses rebuilt from percentages, an estimate for when those failed,
and three separate rules about when a position was safe to save — was
compensation for a positioning model this application did not control. It is
all deleted.

**A position is a CFI**, and nothing else. A CFI is epub.js's address for a
place in a book. The one stored is the one the engine reported for the page it
actually rendered, and resuming hands that same address straight back:

```
resume:  rendition.display(storedCfi)
```

There is no conversion, because a conversion is what failed. `progress` is a
number for the bar and the book page; `position` is where the reader goes.
They are stored side by side in `user_book_state` and never derived from each
other. Calibre-Web's reader keeps a CFI for the same reason.

**The page count is an estimate, and says so.** None of the books this was
built against carry the publisher's own pagination — no `page-list`, so
epub.js's `location.start.page` has nothing to report — and inventing a number
that looks like a printed edition's would be a lie. `pages.ts` counts the
book's own text instead: about 1,800 characters to a page, which is a
paperback's. The measurement the percentage already needs supplies the
character count, so this costs no extra work.

Counting text rather than screens is the point. A count of screenfuls would
grow from "of 22" to "of 40" for the same book the moment the reader chose a
larger size, which reads as the book changing length. The page *shown* can
still move by one, because it is the page that begins at the top of the screen
and where a page begins does change when the text is laid out again — that is
measured and asserted rather than hoped for.

**Progress** is `locations.percentageFromCfi(currentCfi)`. Measuring costs a
pass over the book, a second or two, and its result is cached in
`localStorage` under the book's id and file size. It feeds the number and
nothing else — it never decides where to go. Until it lands, the bar shows no
number rather than a wrong one.

**Writing** is one rule: on `relocated`, debounced one second, send `progress`
and `position` together. A single flag stops writes until the resume has
settled. There is no second guard, because there is nothing left to drift —
resuming to a CFI reports the same CFI back.

**The last page finishes the book.** `set_reading_state` already stamps
`finished_at` when `progress` reaches 1, so the reader needs no new field and
the backend needs no new rule — but it must not wait for the percentage to
arrive at exactly 1 by itself, which the last page of a measured book only
does by luck. The reader knows when there is no next page; that is the same
fact that greys out the forward arrow. On the last page it writes `progress:
1`, and the book is finished.

Jumping to the last page from the contents finishes the book too. That is the
honest reading of the action, and it is what every other reader does.

**Books that predate this** carry a percentage and no CFI. They get one
best-effort `cfiFromPercentage` on first open, and nothing is written until
the reader turns a page, so a bad landing costs nothing. If it fails, that
book starts at the beginning once and has a real position from then on.

**The write sends what it means to send.** `PUT /books/{id}/state` used to
write `rating` unconditionally from a field defaulting to `0`, so a write of
`{progress: 0.42}` cleared the reader's stars. Issue #89 fixed that: every
field is left alone when the caller does not send it. That rule is why
`position` can be added beside `progress` safely.


## Data and API

No new endpoints. The screen uses three that already exist:

| Call | Purpose |
|---|---|
| `GET /books/{id}` | Title for the bar, and the current rating and progress |
| `GET /books/{id}/file` | The EPUB itself, fetched once and parsed in the browser |
| `PUT /books/{id}/state` | Progress and position, a second after a page turn |

## Testing

**epub.js cannot run in the component tests.** It needs a real iframe, and its
renderer waits on `requestAnimationFrame`, which jsdom — the fake browser the
component tests run in — does not drive. A test that mounted the real thing
would hang rather than fail, which is the worst way for a test to break.

So the reader gets a **`BookReader` interface with a fake**, the same shape as
`LibrarianService`: a small seam naming what the screen needs from a book, and
a hand-written fake that answers from a fixture. Component tests run against
the fake. The real implementation wraps epub.js and is covered end to end.

The fake enforces the same rules the real one does, including the awkward
ones: a book that fails to parse, a book that reports the first and last page,
and a resume that lands on the page it was given.

**End-to-end**, against a real backend and a real uploaded book: open a book,
turn a page forward and back, jump to a chapter from the contents, change the
text size, confirm two columns on a wide window and one on a narrow one, and
leave and return to the same page.

**And by hand, against real books.** Three rounds of this reader passed both
suites and were still broken for the person using it. The suites do not
substitute for opening Слон, Творчество and Долгая прогулка and turning pages.


## Accessibility

- Every control in the bar is a real button with an accessible label; three of
  them are icon-only and would otherwise be unreadable to a screen reader.
- The focus ring is the standard 2px `accent` outline at 2px offset.
- The contents drawer traps focus, closes on Escape, and returns focus to the
  button that opened it.
- Arrow keys, Page Up / Page Down and Space turn pages, so the book is
  readable without a mouse. The on-screen arrows are real buttons with labels,
  and are disabled at the first and last page rather than silently doing
  nothing.
- The chapter itself is real text in the page, not an image, so a screen
  reader can read the book.

## What a real book changed

The screen passed 538 component tests, 47 end-to-end tests and a review, then
failed on the first real book anybody opened, and on four more rounds after
that. The findings are recorded because the pattern matters more than the
fixes, and because two of them are facts about EPUB that the next person will
otherwise rediscover the same slow way.

**epub.js measures a book with a different parser than it renders it with.**
Chapters are measured after parsing as XHTML, and rendered after parsing as
HTML. Those are different parsers, and where a book's markup is invalid HTML
they build different trees. One book in the test library wraps a picture in a
paragraph, which HTML does not allow, so the browser lifts the block out —
and from that picture onward the same element has 329 children in the rendered
book and 327 in the measured one. Three of four addresses in that book could
not be found at all. This is why a position is stored as an address taken from
the **rendered** page and never rebuilt from a measurement.

**A relative move cannot restore a position.** The continuous manager reaches
a target with `scrollBy`; the paginated one with `scrollTo`. See "Position,
progress, and turning pages" — this is the finding the rebuild rests on.

**A hidden box measures zero.** The reading area used to carry `hidden` while
the book opened. epub.js measures that element to size the chapter it renders
inside, so every section came out 0px wide: a reader that had downloaded the
book, parsed it, and drawn nothing. The area is always in the DOM now, with
the skeleton laid over it, and `aria-busy` says whether it is ready.

**Sections are addressed by `href`, not by number.** `rendition.display(9)`
returns without error and without moving under the continuous manager. The
contents gives us hrefs anyway.

**A book file can be cached under an id that now holds a different book.** Ids
are reused after a delete, and the browser will serve a heuristically fresh
copy without revalidating. The fetch asks for `no-cache`, which revalidates
against the ETag — cheap when the book is unchanged, and never wrong.

**A kind fixture hides everything.** Every defect above survived a full green
suite. The fixtures were too tidy: a fake that resumed exactly where it was
told, an EPUB whose markup round-tripped between parsers, a book with three
short chapters where one measured position was worth two percentage points and
any error fitted inside it. Fixtures are built awkward on purpose now, and
when one still cannot reach a defect the test says so in as many words rather
than implying coverage it does not have.

**Do not paint over a failure.** When resuming was unreliable, the bar was made
to show the stored number instead of the live one. That turned a visible bug
into an invisible one: the reader sat on the cover of a book while the bar
said 3%. The number shown is the number measured, and when the reader is not
where they should be, the screen says so.


## Accepted limitations

- The whole book downloads before the first page. On a home network this is
  fine; it is the cost of needing no server-side parsing.
- **No scrolling, and none planned.** The reader turns pages.
  [Issue #92](https://github.com/eugene-chekan/libra/issues/92) asked for
  scrolling as a choice and was closed as not planned: offering it means a
  second way of placing the reader, with its own write rule and its own
  end-of-book handling, and that second way is the one already shown to lose a
  reader's place. Two code paths for one screen, one of them known bad, is
  worse than not having the choice.
- The page count is the reader's own estimate, not the publisher's. A book
  that ships a real `page-list` could show true printed pages; none in the
  test library does, so that path is not built.
- The book's own stylesheet is applied, but fixed-layout titles and complex
  typography are not a target. This is a reader for prose.
- The librarian panel covers the right edge of the text while open.
- **epub.js will not render in a hidden browser tab.** Its renderer waits on
  `requestAnimationFrame`, which browsers never fire while the tab is hidden.
  It does not fail; it hangs, with no error. Anything that mounts this screen
  off-screen will look broken for reasons that give no clue.

## Open questions

None. The two that stood here — whether the bar shows the chapter, and whether
the last page finishes the book — were both answered yes on 2026-09-03 and are
written into "Layout" and "Position, progress, and turning pages" above.
