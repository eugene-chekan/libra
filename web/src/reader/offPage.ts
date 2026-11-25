/**
 * The usual way to hide text from the eye but not from a screen reader. `auto` leaves it where
 * the text around it would have put it: `0` is the page's outer edge, outside its margin, and
 * epub.js counts a page as overflowing by even one pixel past that margin.
 */
const VISUALLY_HIDDEN: Record<string, string> = {
  position: 'absolute',
  left: 'auto',
  top: 'auto',
  margin: '0',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  'clip-path': 'inset(50%)',
  'white-space': 'nowrap',
}

/** Hides on the first page every element a book has placed wholly before it. Returns how many. */
export function pullInOffPage(document: Document): number {
  const body = document.body
  const view = document.defaultView
  if (!body || !view) return 0

  // Only a left-to-right, horizontal page starts at the left edge. In any other a negative
  // position can be real text.
  const page = view.getComputedStyle(body)
  if (page.direction === 'rtl' || page.writingMode.startsWith('vertical')) return 0

  // Every measurement first, then every change: a change between two measurements would make
  // the browser lay the whole chapter out again for the next one.
  const before = new Set(
    [...body.querySelectorAll<HTMLElement | SVGElement>('*')].filter(
      (element) => element.getBoundingClientRect().right < 0
    )
  )
  const outermost = [...before].filter((element) => !hasAncestorIn(element, before))

  for (const element of outermost) {
    for (const [property, value] of Object.entries(VISUALLY_HIDDEN)) {
      element.style.setProperty(property, value, 'important')
    }
  }
  return outermost.length
}

/** Whether any element above `element` is in `elements`. */
function hasAncestorIn(element: Element, elements: Set<Element>): boolean {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (elements.has(parent)) return true
  }
  return false
}
