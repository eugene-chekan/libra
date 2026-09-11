/**
 * Where a tap landed across the book, as a fraction of its width — or null when the tap was
 * not a page turn at all.
 *
 * Its own module because `EpubBookReader` cannot be tested: epub.js does not run in jsdom.
 * None of this needs epub.js, only the iframe's window, so keeping it apart is what lets the
 * two refusals below be tested rather than assumed.
 */
export function tapFraction(event: MouseEvent, view: Window | null): number | null {
  if (!view) return null

  if (view.getSelection()?.toString()) return null

  const target = event.target
  if (target instanceof Element && target.closest('a')) return null

  const width = view.innerWidth
  // Zero means the book has not been laid out yet. Dividing by it gives Infinity, which the
  // screen would read as a tap at the far right, and turn the page.
  if (!width) return null

  return event.clientX / width
}
