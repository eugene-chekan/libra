/**
 * Where a tap landed across the visible page, as a fraction of the page's width — or null when
 * the tap was not a page turn at all.
 *
 * Its own module because `EpubBookReader` cannot be tested: epub.js does not run in jsdom. None
 * of this needs epub.js, so keeping it apart lets every rule below be tested.
 */
export function tapFraction(
  event: MouseEvent,
  view: Window | null,
  page: { left: number; width: number }
): number | null {
  if (!view) return null

  if (view.getSelection()?.toString()) return null

  const target = event.target
  if (target instanceof Element && target.closest('a')) return null

  // Zero means the page is not laid out yet. Dividing by it gives Infinity, which the screen
  // would read as a tap on the far right, and turn the page.
  if (!page.width) return null

  const frame = view.frameElement
  if (!frame) return null

  // epub.js makes the iframe as wide as the whole chapter, and turns a page by sliding it left.
  // So clientX, measured from the iframe's own left edge, is not a place on the screen. Adding
  // where that edge is now turns it into one.
  const onScreen = frame.getBoundingClientRect().left + event.clientX
  return (onScreen - page.left) / page.width
}
