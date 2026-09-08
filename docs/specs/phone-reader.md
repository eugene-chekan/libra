# Spec: The Reader on a Phone

**Status:** Designed 2026-09-08, not started. Issue #113.

Split out of [phone-layout.md](phone-layout.md), which deliberately stopped at
the shell and the browsing screens and named the reader as its own problem.

## Why

The reader works on a phone in the sense that it renders. Three things make it
poor to actually read on.

**The text column is too narrow.** `ReaderScreen.module.css` sets
`--reader-usable: calc(100% - 112px)`. That 112px is not decoration: the two
page-turn arrows are 44px circles sitting 8px from each edge, and the margin
is what keeps the text clear of them. On a 390px phone it leaves 278px for the
words.

**A 44px arrow in a margin is not how a page turns under a thumb.** It is a
mouse control. On a phone the arrows cost more width than they earn.

**Two of the three appearance settings do nothing.** The width control offers
Narrow (60em), Medium (88em) and Wide (uncapped). A phone screen is narrower
than the narrowest of those, so all three produce the same column. The control
is there and changes nothing, which is worse than not being there.

The reader is not unusable meanwhile — `ReaderBar` already drops the chapter
name below 700px and the page numbers below 560px.

## How a page turns

**Tap the left or right third of the page.** This is what Kindle uses as its
main way, and it was chosen over a swipe for two reasons.

A swipe competes with selecting text. Both are a horizontal drag on words, and
only a long press separates them. It also competes with the browser: this app
runs in a mobile browser rather than as an installed app, and on iOS Safari a
swipe from the left edge goes back a page in history — the exact gesture and
the exact place a "previous page" swipe would start.

A tap is not a selection gesture and is not a browser gesture, so it competes
with nothing.

### Where the tap is heard

The book is rendered by epub.js **inside an iframe**. A page in an iframe is a
separate document, and a tap on it never reaches the page around it. That
single fact decides the shape of this.

epub.js already solves it. `Rendition` registers `passEvents` as a content
hook, and that forwards every entry in its `DOM_EVENTS` list — which includes
`click`, `touchstart` and `touchend` — out of the iframe. So `rendition.on(
'click', …)` receives real taps, with their coordinates.

This is worth stating because it rules out the obvious alternative: laying an
invisible layer over the book and catching taps there. That layer would also
swallow every tap meant for the text, so selecting a quote and following a
footnote link would both stop working.

`BookReader` gains one method, and `FakeBookReader` implements it too:

```ts
/** Taps inside the book, as a fraction across its width. Returns an unsubscribe. */
onTap(listener: (fraction: number) => void): () => void
```

A fraction rather than a pixel, so the reader knows nothing about where the
zones are. `ReaderScreen` decides that below one third turns back and above two
thirds turns forward, and the middle third does nothing.

**A tap is ignored when it is not a page turn.** Two cases: something is
selected, or the tap landed on a link. Without those, choosing a word would
also turn the page, and a footnote would move the book twice.

## The arrows move into the bar

On a phone the two arrows leave the margin and join the other controls in
`ReaderBar`, beside Contents and Text size. They keep the labels they have,
"Previous page" and "Next page".

This is not tidying. It does two jobs at once.

**It makes the tap zones discoverable.** The known weakness of a tap zone is
that nothing tells you it is there. A visible arrow does.

**It keeps the reader usable without sight.** A tap zone is a listener, not an
element, so a screen reader cannot find it. The arrows are real buttons with
real names, and moving them changes only where they sit. Accessibility is
enforced here rather than intended, and this is the part of the change that
carries it.

*Considered and rejected:* transparent buttons laid over the left and right
edges of the text. They would be both discoverable and accessible, and they
would block text selection across a third of the page on each side — trading
away one of a reader's core actions to add another.

On a window wider than a phone nothing changes. The arrows stay where they
are, because a mouse has no tap zones and the width is not scarce.

## What the text gains

With no arrows in the margin, the 112px comes back. `--reader-usable` becomes
`calc(100% - 32px)` on a phone — 16px each side, so the words do not run into
the screen edge.

On a 390px phone that is 278px of text becoming roughly 358px — about a
quarter more words per line.

## The appearance menu

**The width control is hidden on a phone.** All three of its values produce the
same column there, so it is a control that does nothing. Hiding it is honest;
redefining what "Wide" means on a small screen would be inventing a setting
nobody asked for.

**Text size stays, unchanged.** It is the setting that matters most on a small
screen, and its three values — 95%, 110% and 130% — need no adjustment that
anybody has evidence for.

## Scope

**In scope:**
- `onTap` on the `BookReader` seam, in both the epub.js reader and the fake.
- Tap zones wired in `ReaderScreen`, with the selection and link guards.
- The arrows moving into `ReaderBar` below the phone breakpoint.
- The reading width reclaiming the arrow margin on a phone.
- Hiding the width control on a phone.
- Tests, including one end-to-end tap on a real phone-sized viewport.

**Out of scope:**
- Swipe. Rejected above, and adding it later needs no redesign — it would
  attach to the same forwarded events.
- Changing the three text sizes.
- `ReaderBar`'s existing responsive drops, which already work.
- Anything about the reader on a tablet. The phone breakpoint
  (`PHONE_MAX_WIDTH`, 767) is the only line this draws.

## Testing

- **Component tests** for the tap zones against `FakeBookReader`: a tap in the
  left third goes back, the right third goes forward, the middle does nothing,
  and a tap is ignored while text is selected and when it lands on a link.
- **Component tests** for the arrows appearing in the bar below the breakpoint
  and beside the text above it, and for the width control being hidden.
- **One end-to-end test** at a phone viewport: tap the right third, and the
  page moves. This is the only place a real iframe and a real forwarded event
  exist, so it is the only place the central mechanism is proven.
- Every guard mutation-tested by hand, per the house rule.
