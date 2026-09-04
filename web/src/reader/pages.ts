/**
 * About how many characters fill one printed page. A paperback runs somewhere between 1,600
 * and 2,000, and this sits in the middle of that.
 */
const CHARS_PER_PAGE = 1800

/** How far through the book the reader is, counted in pages. */
export interface Pages {
  current: number
  total: number
}

/**
 * Estimated printed pages, or null for a book whose length is not known yet.
 *
 * An estimate. None of the books this was built against carry the publisher's own pagination,
 * so there is no real page number to report and this does not pretend otherwise.
 *
 * Counted from the text rather than from the screen, so the length of a book in pages is the
 * same at every text size — a count of screenfuls would grow from "of 22" to "of 40" for the
 * same book when the reader chose a larger size. The page shown can still move by one, because
 * it is the page that begins at the top of the screen and where a page begins does change when
 * the text is laid out again.
 */
export function pagesAt(charactersRead: number, charactersTotal: number): Pages | null {
  if (charactersTotal <= 0) return null

  const total = Math.max(1, Math.round(charactersTotal / CHARS_PER_PAGE))
  const reached = Math.ceil(charactersRead / CHARS_PER_PAGE)
  return { current: Math.min(total, Math.max(1, reached)), total }
}
