# Spec: Phone Layout

**Status:** Design approved 2026-09-05. Covers issue #112. **Replaces the
Viewport section** of [client-design.md](client-design.md) — see the note
added there.

## What changes, and what it costs

[client-design.md](client-design.md) says: "Below 1024px the layout is
undefined; the handoff's desktop-only stance stands, and mobile is a Phase 5
design problem." That was a real decision, made when the client was drawn, and
this spec reverses it on request.

Two things follow. `AppShell`'s `min-width: 1024px` goes, which means the
768–1023px band stops being undefined as well — removing the floor exposes it
whether or not anybody asked for a tablet. And the desktop layout stops being
the only layout, so every screen added from here needs looking at twice.

## Scope

**In scope.** The shell and the browsing screens, down to about 390px:
library, book detail, shelves, admin, login, the modals, and the librarian
panel.

**Out of scope, deliberately:**

- **The reader** (#113). It reserves 112px of margin for two arrow buttons,
  and turning a page under a thumb wants a swipe or tap zones instead. Its own
  decisions, and folding them in doubles this document. It already drops its
  chapter name below 700px and its page numbers below 560px, so it is not
  unusable meanwhile.
- **Native or installable builds.** Phase 5's business. This is a web page
  that works on a phone, nothing more.
- **Landscape as a distinct design.** A phone in landscape is 844px wide,
  which lands in the tablet band and gets the tablet layout.

## Two widths, one floor removed

| band | what it is | layout |
|---|---|---|
| ≥1024px | desktop, as built | sidebar column, unchanged |
| 768–1023px | tablet, and a narrow desktop window | sidebar column, tighter padding, grid reflows |
| <768px | phone | top bar and drawer |

`--libra-min-width` is deleted rather than lowered — nothing enforces a floor
any more.

The breakpoint cannot be a token: **a CSS custom property cannot be used
inside a media query.** So it is a constant in `theme/breakpoints.ts` for the
JavaScript that needs it, and the same number written again in each `@media`
rule, every one pointing back there in a comment.

Two copies of a number is exactly the drift this project usually refuses, so
it is tested rather than trusted: `e2e/shell.spec.ts` drives the window to
either side of the boundary and checks the layout and the drawer change at the
same pixel. A layout that switches at 768px in CSS while the drawer switches at
700px in JavaScript is a bug nobody finds until a 740px window.

## The phone shell

A **56px top bar** holding two things: the menu button on the left and the
`libra` wordmark beside it. Below it, the pane, with padding down from 36px to
16px.

**The wordmark, not the page title.** Every screen already draws its own `h1`
as the first thing in the pane, immediately under the bar — putting the title
in the bar as well would say it twice on the screen with the least room for
it, and would need either a route-to-title map or a context that every screen
writes to. The bar reads as the app's own header, which is what the sidebar's
header does on a desktop.

The **drawer** is the existing `<Sidebar/>` component. Not a copy of it, not a
phone variant of it — the same component, hosted somewhere else. It holds
everything it holds on a desktop, because it is the same thing: nav, shelves,
shared, tags, Add Book, the account row, the version line.

**It closes when you choose something.** A drawer still covering the page you
just asked for is a drawer that made you tap twice.

**The collapse toggle is not drawn on a phone.** A drawer that is already an
overlay has nothing to collapse into, and the stored preference is left alone
rather than overwritten — collapse it on a laptop, open it on a phone, and the
laptop still finds it collapsed.

### Why a drawer and not a bottom bar

A bottom tab bar is the phone idiom and reaches the thumb better. It was
rejected because four icons cannot hold the shelf list, the tag list, Add Book
and the account menu, so those need a second home — which means designing two
navigation systems and deciding which owns what. One system that already
exists beats two that do not.

### Why Radix, and what it costs

The drawer is a `Dialog`, not a CSS transform. A transform is less code, but a
panel covering the screen with the page still reachable behind it by Tab is
not a drawer, it is a decoration. Radix brings the focus trap, Escape, and the
scroll lock, and there is precedent in this codebase: `LibrarianPanel` is
already a slide-over built this way.

That needs the markup to differ by viewport, not only the CSS, so a
`useIsPhone()` hook over `matchMedia` decides which host renders the sidebar.

**The cost, stated plainly: `matchMedia` does not exist in jsdom.**
`src/test/setup.ts` gains a stub, and every component test that renders the
shell then depends on it. That is a shared fixture doing real work, and it is
the main thing this design pays for the focus trap with.

## The screens

**Library.** The grid is already `repeat(auto-fill, minmax(160px, 1fr))`, so
it reflows to two covers across on its own once the pane padding drops. The
search box moves up into the row beneath the top bar, where it gets the full
width — it is the first thing you want on this screen, and this is the only
screen that has one.

**Book detail.** `.layout` is a flex row with a 200px cover column and a 40px
gap. On a phone it stacks: cover above, details below, cover centred at 200px
rather than stretched — a full-width cover on a phone is a wall of art with
the title pushed off screen. Both action rows wrap.

**Shelves.** The rows of covers already scroll sideways, which is the right
behaviour on a phone and needs nothing. The page header's "Manage Shelves"
button wraps under the heading.

**Admin, shelf manager, tag manager.** All three are row lists with controls
on the right. The controls wrap under the name rather than squeezing, because
squeezing is how a 44px target becomes a 22px one.

**Modals.** Nothing to do. They already carry both ceilings —
`max-width: 90vw` and `max-height: 80vh` — and the comment above them in
`widgets/Modal.module.css` says why: "a fixed width overflows a narrow window,
and a tall dialog on a short screen needs somewhere to scroll". Written for a
desktop that never got narrow, and correct for a phone by accident.

**Librarian panel.** Fixed at 480px, which is wider than the phone. It becomes
full width below the phone breakpoint.

**Login.** Centred card, already fluid. Needs the card's fixed width relaxed
and nothing else.

## Touch

Every control reaches **44px** in its smallest dimension on a phone. Several
miss today at 38px — the sidebar rows, the filter rows, the manager row
buttons. This is a phone-only rule: the desktop rows stay 38px, because a
pointer is not a thumb and 44px rows would make the sidebar taller for no
reason.

Hover styles are left exactly as they are. A phone browser applies `:hover`
on tap and holds it until you tap elsewhere, which is ugly, but the fix —
`@media (hover: hover)` around every hover rule — touches every stylesheet in
the app for a cosmetic problem. Named here so it is a decision rather than an
oversight, and left for a later pass.

## Testing

**Component tests** stub `matchMedia` both ways: that the drawer is not
rendered on a desktop, that the top bar is not rendered on a desktop, and that
on a phone the sidebar reaches the page through the drawer and closes when a
row is chosen.

**A real browser** for everything jsdom cannot see, at 390px: no horizontal
scroll on any screen, the grid at two columns, the book page stacked, and the
drawer's focus trap — Tab from the last row goes to the first, not to the page
behind.

**No screenshot comparison.** This project has no visual-regression setup, and
adding one for this is a bigger decision than this spec.

## What this does not solve

- The reader, as above (#113).
- `:hover` sticking after a tap, as above.
- Anything about performance on a phone. The library grid renders every book
  it is given, and a thousand-book library on a phone is a question this spec
  does not ask. It is not new — the desktop grid does the same — and it is not
  made worse here.
