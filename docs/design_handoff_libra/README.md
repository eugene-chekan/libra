# Handoff: Libra — Personal Reading Library

## Overview
Libra is a desktop web app for tracking a personal book collection. Users browse their
library as a cover grid, filter by tag, view and edit individual book records, organise
books onto named shelves, and manage the shelf and tag vocabularies.

The prototype covers five surfaces: a Library grid, a Shelves view, a Book Detail page,
an Add Book modal, and two management modals (Tags, Shelves).

## About the Design Files
The files in this bundle are **design references created in HTML** — React-in-the-browser
prototypes (Babel-transpiled, no build step) that demonstrate the intended look, layout,
and interaction model. **They are not production code to copy directly.**

The task is to **recreate these designs in the target codebase's existing environment**
(React, Vue, SwiftUI, native, etc.) using its established component library, styling
approach, routing, and state patterns. If no environment exists yet, choose the framework
most appropriate for the project and implement the designs there.

Specifically, do not carry over these prototype-only artifacts:
- All styling is inline \`style={{}}\` objects. Move to the codebase's styling system
  (CSS modules, Tailwind, styled-components, etc.).
- \`Object.assign(window, {...})\` exports at the bottom of each file are a workaround for
  Babel-in-browser scoping. Use real module imports.
- The \`LibraTokens\` plain object should become real design tokens (CSS custom properties,
  a theme file, or the codebase's existing token source).
- Book data is a hardcoded array in \`data.jsx\`. Replace with the real data layer.
- The Tweaks panel in \`Libra Prototype.html\` is a prototype-only affordance for
  previewing variants. It is not a product feature — do not implement it.

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, shadows, and transitions are final
and specified exactly below. Recreate the UI pixel-perfectly, substituting the codebase's
existing primitives (buttons, inputs, modals) where they can be styled to match.

Layout is designed for a desktop viewport at 100vh with no vertical page scroll — the
sidebar and content pane scroll independently. **No responsive or mobile design exists.**
If the target app needs mobile, that is a new design problem; ask before inventing it.

---

## Design Tokens

Source of truth: \`proto/components.jsx\` → \`LibraTokens\`.

### Colors
| Token | Hex | Usage |
|---|---|---|
| \`bg\` | \`#f7f5f2\` | Sidebar background, input fills, inset panels |
| \`card\` | \`#ffffff\` | Main content pane, modal surfaces |
| \`border\` | \`#e8e4df\` | All 1px borders, dividers, empty progress track |
| \`text\` | \`#2a2520\` | Primary text, headings |
| \`textMid\` | \`#6b6259\` | Secondary text, labels, inactive nav |
| \`textLight\` | \`#a39a8e\` | Tertiary text, metadata, placeholders, icons |
| \`accent\` | \`#8b5e3c\` | Primary actions, active states, progress fill, stars |
| \`accentHover\` | \`#7a5030\` | Primary button hover |
| \`accentLight\` | \`#f0e8df\` | Active nav background, tag pill background |
| \`accentLighter\` | \`#f8f3ed\` | Row hover background, inline edit field background |
| \`coverBg\` | \`#e8e4df\` | Cover placeholder fallback |
| — | \`#c44\` | Destructive icon hover (delete buttons) |

Selection highlight: \`::selection { background: #8b5e3c33 }\`.

### Typography
Two families, loaded from Google Fonts:
- **Serif** — \`"Instrument Serif", Georgia, serif\`. Used for the logo, page titles, book
  titles on covers, shelf names, and modal headings. Always weight 400.
- **Sans** — \`"DM Sans", system-ui, sans-serif\`. Everything else. Weights 400/500/600/700.

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
Metadata           11-13px sans 400, color textLight
```

Body has \`-webkit-font-smoothing: antialiased\`.

### Spacing, radius, shadow
```
Content pane padding      28px 36px
Sidebar padding           28px 16px
Sidebar width             240px (fixed, flex-shrink 0)
Standard radius           8px  (LibraTokens.radius)
Modal radius              12px
Cover radius              4px
Pill radius               20px
Grid gap (library)        28px
Shelf row gap             20px
Form field gap            18px (add modal) / 14px (detail edit)

Cover shadow (rest)   2px 4px 12px rgba(0,0,0,.12), 0 1px 3px rgba(0,0,0,.08)
Cover shadow (hover)  3px 8px 20px rgba(0,0,0,.18)
Modal shadow          0 24px 80px rgba(0,0,0,.2)
Dropdown shadow       0 8px 24px rgba(0,0,0,.12)
Tweaks panel shadow   0 8px 40px rgba(0,0,0,.15)
```

### Transitions
```
Color / border / background   .15s   (default for interactive elements)
Row hover background          .12s   (sidebar rows, dropdown items)
Cover lift                    .2s    (transform + box-shadow)
Progress bar width            .3s
Chevron rotate                .2s
Modal enter                   .25s ease-out
Dropdown enter                .15s ease-out
Lightbox fade                 .2s ease-out
```

Modal enter keyframes: \`opacity 0 → 1\`, \`translateY(12px) scale(.98) → none\`.
Dropdown enter: \`opacity 0 → 1\`, \`translateY(4px) → none\`.
Lightbox cover scale-in: \`scale(.85) → scale(1)\` with opacity, .25s ease-out.

---

## Data Model

```ts
type Book = {
  id: number;
  title: string;
  author: string;        // falls back to 'Unknown Author' on create
  pages: number;         // falls back to 200 on create
  pct: number;           // reading progress, 0–1 inclusive
  rating: number;        // 0–5 integer; 0 = unrated
  year: number;
  tags: string[];        // falls back to ['Uncategorized'] on create
  shelf: string;         // '' means NOT on any shelf
  blurb: string;         // may be empty
};
```

\`shelf\` is a **free-form string matched by name**, not an id. Renaming a shelf therefore
does not follow the books on it — see Known Gaps. In a real implementation, model shelves
as entities with stable ids and reference them by id.

Seed data: 12 books in \`proto/data.jsx\`. Default shelves: \`['Currently Reading',
'Completed', 'To Read']\`. Tag vocabulary is derived — the union of every tag on every book
plus any user-created tags, sorted alphabetically.

---

## Screens / Views

### 1. Sidebar (persistent, all screens)
\`LibraSidebar\` in \`proto/components.jsx\`.

240px fixed width, full height, \`bg\` background, 1px right border, own vertical scroll.
Vertical flex, top to bottom:

1. **Logo** "Libra" — 28px serif, \`text\`, 12px horizontal padding, 36px bottom margin.
2. **Primary nav** — 4px gap. Two rows: *Library* (4-square grid icon) and *Shelves*
   (3-line-with-uprights icon). Rows are 10px/12px padding, 8px radius, 12px icon-to-label
   gap, 14px sans. Active row: \`accentLight\` background, \`accent\` text, weight 600.
   Inactive: transparent, \`textMid\`, weight 400. Icons are 18px, 1.8 stroke.
3. **Shelves section** (32px top margin) — collapsible. Header is a section label with a
   12px chevron that rotates -90° when collapsed. Body lists each shelf name at 13px sans
   \`textMid\`, 7px/12px padding, 6px radius, \`accentLighter\` on hover. Below the list, a
   "Manage Shelves" row: 12px \`accent\` text with a 12px plus icon. Open by default.
4. **Tags section** (28px top margin) — same collapsible pattern. Each tag row has a 14px
   tag-outline icon and the label. Active tag: \`accent\` text, weight 600,
   \`accentLighter\` background, plus a 6px \`accent\` dot right-aligned. "Manage Tags" row
   matches the shelves one. Open by default.
5. **Add Book button** — pinned to the bottom via \`margin-top: auto\`, 16px top padding.
   Full width, 10px vertical padding, 1.5px **dashed** \`border\`, transparent fill, 13px
   \`textMid\` label with a 16px plus icon. On hover, border and text both go \`accent\`.

Note: on the Book Detail page the sidebar highlights *Library* as active.

### 2. Library (default view)
\`LibraryPage\` in \`proto/page-library.jsx\`.

**Header row** — "Library" (30px serif) left, book count ("N books", 13px \`textLight\`)
right, 8px bottom margin.

**Search bar** — full width, 42px tall, 8px radius, 1px \`border\`, \`bg\` fill, 40px left
padding to clear a 16px search icon positioned at left 14px, vertically centered. Border
goes \`accent\` on focus. Placeholder: "Search books, authors… or type #tag".

Search supports two token types in one field:
- Bare words → substring match against title **or** author, case-insensitive.
- \`#tag\` tokens → tag filter.

**Tag autocomplete** — while the token under the cursor starts with \`#\`, a dropdown opens
below the field (4px gap, full width, max-height 200px, scrollable). It is headed by a
"TAGS" section label and lists matching tags as \`#Name\` rows with a 14px accent tag icon.
Suggestions are tags that start with the typed fragment and are not already applied.
Selecting one replaces the token and appends a trailing space. The dropdown closes on
blur after a 200ms delay so the click registers.

**Active filter summary** — shown only when at least one tag filter is active. Reads
"Filtered by:" (12px \`textLight\`) followed by solid \`accent\` pills (white text, 12px,
3px/10px padding, 20px radius) and a trailing italic "(OR)" hint at 11px.

**Filter semantics:** sidebar tags and \`#tags\` are merged into one set and applied with
**OR** logic — a book matches if it carries any one of them. The text query is applied
with AND against that result.

**Grid** — \`grid-template-columns: repeat(auto-fill, minmax(160px, 1fr))\`, 28px gap.
Each cell is a vertical flex with 10px gap:
- Cover, full cell width, nominal 160×232 (the component's 1.45 aspect).
- Title — 13px sans 600, \`text\`, line-height 1.3, clamped to 2 lines.
- Author — 12px sans, \`textLight\`.
- Status line, one of three states:
  - \`0 < pct < 1\` → progress bar plus right-aligned "N%" at 11px \`textLight\`.
  - \`pct === 1\` → 12px star rating, read-only.
  - \`pct === 0\` → italic "Not started", 11px \`textLight\`.

**Empty state** — centered "No books match your search." at 14px \`textLight\` with 60px
vertical padding.

### 3. Shelves
\`ShelvesPage\` in \`proto/page-shelves.jsx\`.

"Shelves" title (30px serif, 32px bottom margin), then one block per shelf in the user's
configured order, 44px apart.

Each block: shelf name (22px serif) baseline-aligned with a count ("N books", 13px
\`textLight\`), 10px gap, 16px bottom margin. Below it a horizontal row of books, 20px
gap: 96×140 cover, centered 11px sans 500 title clamped to 2 lines, and — for
in-progress books only — a 70×3 progress bar.

Under the row, the shelf itself is drawn as two stacked bars: a 3px bar with
\`linear-gradient(90deg, accent44, border)\` and 2px radius, then an 8px
\`linear-gradient(180deg, rgba(0,0,0,.04), transparent)\` for the drop shadow.

**Empty shelf** — a 1.5px dashed \`border\` box, 8px radius, 32px vertical padding, centered
"No books on this shelf yet" at 13px \`textLight\`.

Books whose \`shelf\` is \`''\` or an unknown name appear on no shelf block. There is
currently **no unshelved section** — see Known Gaps.

### 4. Book Detail
\`BookDetailPage\` in \`proto/page-detail.jsx\`. Has a view mode and an edit mode.

**Back link** — "Back to Library" with a 16px left-chevron, 13px \`textLight\`, goes
\`accent\` on hover. 28px bottom margin.

Two columns, 40px gap.

**Left column (200px, fixed):** 200×292 cover, clickable to open the lightbox. Below it,
if a blurb exists, 12px italic \`textMid\` at line-height 1.5 with \`text-wrap: pretty\`.

**Right column (view mode):**
- Title — 34px serif, letter-spacing -0.5, line-height 1.15.
- Author — 16px sans \`textMid\`.
- Metadata — 13px \`textLight\`: \`{pages} pages · {year}\`, then \` · {shelf}\` **only if the
  book is on a shelf**. An unshelved book shows no trailing separator.
- Interactive 18px star rating — clicking sets the rating immediately (no save step).
- Tag pills, 8px gap, read-only.
- **Reading Progress panel** — \`bg\` fill, 8px radius, 20px/24px padding. "READING
  PROGRESS" section label, an 8px progress bar, then a row with "{read} of {total} pages"
  (13px \`textMid\`) left and "{N}%" (13px sans 600 \`accent\`) right.
- **Action row**, 10px gap:
  - Primary button — \`accent\` fill, white, 11px/24px padding, 14px sans 600. Label is
    "Start Reading" when \`pct === 0\`, "Continue Reading" when \`0 < pct < 1\`, "Read Again"
    when \`pct === 1\`. Hover → \`accentHover\`.
  - "Edit Book" — outlined, 1.5px \`border\`, \`card\` fill, \`textMid\` label. Hover turns
    border and text \`accent\`.
  - "Move to Shelf" — same outlined treatment plus a 10px chevron. While the dropdown is
    open the button shows \`accentLight\` fill, \`accent\` border and text.
- **Notes & Highlights** — section label, then quote cards: \`bg\` fill, 8px radius, 3px
  solid \`accent\` left border, 14px/18px padding, 10px apart. Each holds the quoted text
  (13px \`text\`, line-height 1.5) and "Page N" (11px \`textLight\`). Below, a full-width
  "+ Add Note" button with 1.5px dashed border that goes \`accent\` on hover.
  **Notes are hardcoded placeholder content in the prototype** — two fixed quotes, and the
  Add Note button is inert. Treat notes as a design direction, not a specified feature;
  confirm scope before building.

**Move to Shelf dropdown** — opens **upward** (\`bottom: 100%\`, 6px gap), min-width 200px,
\`card\` fill, 1px \`border\`, 8px radius, 4px padding. Contents:
1. A non-interactive header: "CURRENT: {shelf}" — reads "CURRENT: NONE" when unshelved.
2. Every shelf except the current one, as 8px/12px rows, 13px \`text\`, 4px radius,
   \`accentLighter\` on hover. Clicking assigns that shelf and closes.
3. **Only when the book is on a shelf** — a 1px \`border\` divider (4px/8px margin) then a
   "Remove from shelf" row with a 12px × icon, 13px \`textLight\`. Clicking sets
   \`shelf: ''\` and closes.

Closes on outside click (\`pointerdown\` listener on \`document\`, bound only while open).

**Right column (edit mode):** replaces the whole info column. Header row reads "Edit Book"
(14px sans 700) with Cancel (outlined) and Save (\`accent\`) buttons at 7px/14px, 12px
labels. Fields, 14px apart, all 36px tall with 12px horizontal padding and
focus-to-\`accent\` borders:
- Title (full width)
- Author / Year — two equal columns, 12px gap
- Pages (number) — sits with Author/Year row set
- Shelf — native select. First option is **"No shelf"** with an empty value, then every
  configured shelf.
- Progress — range input, min 0, max 1, step .01, \`accent-color: accent\`. Label reads
  "Progress — {N}%" and updates live.
- Blurb — textarea, 3 rows, min-height 60px, vertical resize only, line-height 1.5.
- Tags — wrapped pills, 6px gap, toggled on click.

Save commits the whole form at once (parsing pages/year to int, pct to float). Cancel
discards. Progress, rating, and shelf are the only fields also mutable outside edit mode.

**Cover lightbox** — full-screen \`rgba(42,37,32,.6)\` overlay with 12px backdrop blur,
centered 480×700 cover. Closes on overlay click or a 36px circular × button at top-right
(20px inset, \`rgba(255,255,255,.15)\` fill, white glyph). Inner cover stops propagation.

### 5. Add Book modal
\`AddBookModal\` in \`proto/page-add.jsx\`.

480px wide, \`card\` fill, 12px radius, 32px/32px/24px padding, max-height 90vh with
internal scroll. Overlay: \`rgba(42,37,32,.4)\` with 8px backdrop blur; clicking it closes.

- **Header** — "Add a Book" (24px serif) and a 32px circular × button (\`bg\` fill, 18px
  glyph). 28px bottom margin.
- **Upload zone** — 2px dashed \`border\`, 8px radius, 24px/16px padding, centered. Holds a
  28px upload icon, "Drop an EPUB or PDF here" (13px sans 500 \`textMid\`) and "or click to
  browse" (12px \`textLight\`). On drag-over the border and text go \`accent\` and the fill
  becomes \`accentLighter\`. **The drop handler is a no-op in the prototype** — file
  ingestion and metadata extraction are unspecified. Confirm scope before building.
- **Fields**, 18px apart, 42px tall:
  - Title, marked required with \`*\`. Placeholder "Book title".
  - Author (flex 1) and Pages (100px fixed, number) side by side, 12px gap.
  - Shelf — native select. **Defaults to "No shelf"** (empty value); a new book is
    unshelved unless the user picks one. Options: No shelf, To Read, Currently Reading,
    Completed.
  - Blurb — optional (label carries a lighter "(optional)" span), textarea, 3 rows.
  - Tags — wrapped pills from a fixed vocabulary: Sci-Fi, Fantasy, Literary, Mystery,
    Romance, Non-Fiction, Historical, Adventure, Classic, Short Stories.
- **Footer** — right-aligned Cancel (outlined) and "Add to Library" (\`accent\`), 10px gap,
  28px top margin.

**Validation:** title is the only required field. While it is empty the submit button is
disabled — \`border\` fill, \`textLight\` label, default cursor — and submit is a no-op.
There is no inline error message. On submit: \`id\` = \`Date.now()\`, \`pct\` 0, \`rating\` 0,
\`year\` 2025, empty author → "Unknown Author", empty pages → 200, empty tags →
\`['Uncategorized']\`.

Note the Add Book shelf options are **hardcoded** in the prototype rather than read from
the live shelf list — see Known Gaps.

### 6. Manage Tags modal
\`TagManagerModal\` in \`proto/page-tags.jsx\`.

440px wide, 28px/28px/20px padding, max-height 80vh, column flex with a scrolling middle.

Header: "Manage Tags" (22px serif) with "N tags" beneath (12px \`textLight\`), and the
32px circular × button.

Add row: an input ("New tag name…", 38px tall) and an "Add" button (38px, 16px horizontal
padding, 13px sans 600). Enter also adds. The button is disabled-styled while the input is
empty. Duplicate names — compared case-insensitively — are silently rejected.

List rows: 9px/8px padding, 1px \`border\` bottom, 10px gap. Each row has a 10px color dot
(cycling a fixed 12-swatch palette by index), the name (13px sans 500), a pencil edit
button and a trash delete button (both 14px icons, \`textLight\`, hover \`accent\` and
\`#c44\` respectively). Edit swaps the label for an autofocused inline input with an
\`accent\` border and \`accentLighter\` fill; blur or Enter commits, and an empty value
reverts to the previous name.

Footer: Cancel and "Save Changes". Edits are held locally and only applied on save.

**On save the app removes deleted tags from every book and from the active filter set.**
Renames are **not** propagated to books — see Known Gaps.

Tag dot palette: \`#8b5e3c #5c6b5e #6b5a7b #7a5c5c #5a6878 #8a7a5a #6a5a4a #5a7a6a
#7a6a5a #5e6a7a #7a5a6a #6a7a5a\`.

### 7. Manage Shelves modal
\`ShelfManagerModal\` in \`proto/page-shelves-manager.jsx\`.

460px wide, otherwise structurally identical to Manage Tags. Subtitle reads
"N shelves · Drag to reorder".

Rows carry, left to right: a stacked up/down chevron pair for reordering (12px icons,
disabled and \`border\`-colored at the ends of the list), the name, a book-count badge
(11px \`textLight\` on \`bg\`, 2px/8px padding, 10px radius), then edit and delete buttons.

Deleting a shelf that still holds books raises a native \`confirm()\`: "Move N book(s) to
"To Read" and delete this shelf?". On save, books on any removed shelf are reassigned to
the first remaining shelf, or to "To Read" if none remain.

**Two problems to fix in the real implementation:** the subtitle promises drag-to-reorder
but only the chevron buttons work, and the native \`confirm()\` should be replaced with the
codebase's dialog component.

---

## Interactions & Behavior

### Navigation
Single-pane app, no URL routing in the prototype — a \`page\` string switches the content
pane between \`library\`, \`shelves\`, and \`detail\`. **Add real routes** in the target
implementation (e.g. \`/library\`, \`/shelves\`, \`/books/:id\`) so detail pages are
linkable and the back button works.

- Sidebar *Library* / *Shelves* → switch pane, clear \`detailId\`.
- Sidebar *Add Book* → opens the Add Book modal (it is not a page).
- Sidebar shelf name → navigates to the Shelves pane. **It does not scroll to or filter by
  that shelf** — the handler ignores its argument. Deep-linking to a specific shelf is a
  reasonable improvement; confirm before adding.
- Cover click (library grid or shelves row) → Book Detail for that book.
- "Back to Library" → always returns to Library, even if the user arrived from Shelves.
  Prefer real history navigation in the target implementation.

### Immediate vs. deferred writes
Immediate (no save step): star rating on detail, shelf assignment and removal via the
Move to Shelf dropdown.
Deferred (committed on an explicit Save): the detail edit form, Manage Tags, Manage
Shelves.

### Dismissal
Modals close on overlay click and on their × / Cancel buttons. **No Escape-key handling
and no focus trap** — add both, plus \`role="dialog"\` and \`aria-modal\`, in the real
implementation. The Move to Shelf dropdown closes on outside \`pointerdown\`.

### Hover states, consolidated
- Cover: \`translateY(-3px) scale(1.02)\` with the deeper shadow, .2s — only when clickable.
- Outlined button: border and text → \`accent\`.
- Primary button: fill → \`accentHover\`.
- Dashed button: border and text → \`accent\`.
- List / dropdown row: background → \`accentLighter\`.
- Icon button: → \`accent\`, or \`#c44\` for delete.

### Not designed
Loading states, error states, empty-library first-run state, and any responsive breakpoint
have **no design**. So do keyboard focus rings beyond the browser default. Ask before
inventing these.

---

## State Management

Prototype state lives in \`App\` in \`Libra Prototype.html\` and is passed down as props.
In the target codebase, use its established store / query layer.

| State | Type | Purpose |
|---|---|---|
| \`page\` | \`'library' \\| 'shelves' \\| 'detail'\` | Active content pane |
| \`detailId\` | \`number \\| null\` | Which book the detail pane shows |
| \`books\` | \`Book[]\` | The collection |
| \`customShelves\` | \`string[]\` | Ordered shelf names |
| \`customTags\` | \`string[]\` | User-created tags not yet on any book |
| \`activeTags\` | \`string[]\` | Sidebar tag filters (OR) |
| \`searchQuery\` | \`string\` | Raw search input, including \`#tag\` tokens |
| \`showAdd\` | \`boolean\` | Add Book modal |
| \`showTagManager\` | \`boolean\` | Manage Tags modal |
| \`showShelfManager\` | \`boolean\` | Manage Shelves modal |

Derived: \`allTags\` is the sorted unique union of all book tags and \`customTags\`.
\`selectedBook\` is looked up from \`books\` by \`detailId\`.

Local to components: modal form drafts, \`coverExpanded\`, \`editing\`/\`editForm\`,
\`shelfDropdown\`, sidebar section open/closed, search suggestion visibility, star hover.

**Persistence:** none. All state is in memory and resets on reload. The real
implementation needs a data layer — the prototype is silent on API shape, so this is a
design decision for the developer.

### Mutations
```
addBook(book)          append to books
updateBook(book)       replace by id — used by rating, shelf change, edit save
onUpdateTags(next)     set customTags; strip removed tags from every book;
                       strip removed tags from activeTags
onUpdateShelves(next)  reassign books on removed shelves to next[0] || 'To Read';
                       set customShelves
```

---

## Known Gaps and Bugs

Carried from the prototype. Fix these rather than reproducing them.

1. **Shelf renames orphan their books.** \`Book.shelf\` matches on name, so renaming a shelf
   in Manage Shelves leaves its books pointing at a name that no longer exists — they
   silently vanish from the Shelves view. \`ShelfManagerModal.save()\` contains an empty
   \`renameMap\` loop where this logic was meant to go. **Fix by giving shelves stable ids**
   and referencing them by id. The same bug applies to tag renames.
2. **Add Book's shelf options are hardcoded** ("To Read", "Currently Reading",
   "Completed") instead of reading the live shelf list, so user-created shelves are not
   offered at creation time. The detail edit form does read the live list. Read from one
   source in both places.
3. **No unshelved view.** Books with \`shelf: ''\` — now the default for new books — appear
   in the Library grid but on no shelf block, so the Shelves view cannot reach them. An
   "Unshelved" group or a filter is the obvious fix; confirm the approach before building.
4. **Sidebar shelf clicks do not target the shelf** they name; they just open the Shelves
   pane.
5. **Dead tweak keys.** \`TWEAK_DEFAULTS\` declares \`coverStyle\` and \`gridColumns\`, but
   the library grid is \`auto-fill minmax(160px, 1fr)\` and never reads either. Ignore both;
   the Tweaks panel is not a product feature.
6. **\`accentHover\` is clobbered by the accent tweak.** The effect in \`App\` sets
   \`LibraTokens.accentHover\` to the flat accent value, losing the hover shade. Keep the
   two as independent tokens.
7. **Native \`confirm()\`** in the shelf delete flow. Replace with the codebase's dialog.
8. **Drag-to-reorder is advertised but unimplemented** in Manage Shelves.
9. **Accessibility is largely absent.** Many interactive controls are \`<div onClick>\` with
   no role, \`tabIndex\`, or key handling — including sidebar nav rows, tag rows, shelf
   rows, dropdown items, and autocomplete suggestions. Modals have no focus management.
   Build these as real buttons and dialogs.
10. **Cover \`onMouseLeave\` resets \`transform\` unconditionally**, even for
    non-interactive covers. Harmless, but do not copy the pattern.

---

## Assets

**No image or icon files.** Everything is drawn in code:

- **Icons** — inline SVG, 24×24 or 16×16 viewBox, \`fill="none"\`,
  \`stroke="currentColor"\`, stroke-width 1.5–2, \`stroke-linecap="round"\`. Rendered at
  10–18px. Visually consistent with Feather / Lucide; **substitute the codebase's existing
  icon set** rather than porting the inline paths. Needed: grid (4 squares), shelves
  (3 lines with uprights), tag, plus, chevron down/up/left, search, upload, pencil, trash,
  ×, star (filled).
- **Book covers** — procedurally generated, no artwork. \`LibraCover\` picks a two-color
  palette by \`(bookId - 1) % 12\` from \`COVER_PALETTES\` in \`proto/data.jsx\` and renders
  \`linear-gradient(155deg, c0 0%, c1 100%)\` at 4px radius, plus: a 3px
  \`rgba(0,0,0,.15)\` spine strip on the left edge; two 1px \`rgba(255,255,255,.2)\` rules
  at 20% and 75% height, inset 18% each side; and the centered title in serif at
  \`clamp(10px, width × 0.13, 16px)\`, \`rgba(255,255,255,.92)\`, line-height 1.25, with a
  \`0 1px 4px rgba(0,0,0,.3)\` text shadow. Padding is 6px under 80px wide, else 14px.

  **This is a placeholder for real cover art.** If the target app has cover images, use
  them and keep the gradient as the no-cover fallback. Cover aspect ratio is ~1.45
  (160×232, 96×140, 200×292, 480×700).
- **Fonts** — Instrument Serif (400) and DM Sans (400/500/600/700), loaded from Google
  Fonts in the prototype. Self-host or use the codebase's font pipeline.

---

## Files

All paths relative to this handoff folder.

| File | Contents |
|---|---|
| \`Libra Prototype.html\` | Entry point. \`App\` component, all top-level state, routing, mutation handlers, and the prototype-only Tweaks panel. Open this in a browser to run the prototype. |
| \`proto/data.jsx\` | \`LIBRA_BOOKS\` seed array (12 books) and \`COVER_PALETTES\`. |
| \`proto/components.jsx\` | \`LibraTokens\` (design tokens) and shared components: \`LibraCover\`, \`LibraProgress\`, \`LibraStars\`, \`LibraTag\`, \`LibraIconBtn\`, \`LibraSidebar\`. Read this first. |
| \`proto/page-library.jsx\` | \`LibraryPage\` — grid, search, \`#tag\` parsing, autocomplete. |
| \`proto/page-shelves.jsx\` | \`ShelvesPage\` — shelf rows. |
| \`proto/page-detail.jsx\` | \`BookDetailPage\` — view mode, edit mode, Move to Shelf dropdown, cover lightbox. |
| \`proto/page-add.jsx\` | \`AddBookModal\`. |
| \`proto/page-tags.jsx\` | \`TagManagerModal\`. |
| \`proto/page-shelves-manager.jsx\` | \`ShelfManagerModal\`. |

To run: open \`Libra Prototype.html\` directly in a browser. It needs network access for
the React, Babel, and Google Fonts CDN loads, and it must be served or opened such that
the relative \`proto/*.jsx\` paths resolve.

\`LibraIconBtn\` is exported but unused in the current screens.
