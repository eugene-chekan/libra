/**
 * epub.js measures a book by walking every chapter and marking a position every so many
 * characters. That pass is what makes a real percentage possible, and it costs a second or
 * two on a long novel — so its result is kept, and a book is measured once rather than on
 * every open.
 *
 * Keyed by the book's id and the size of its file. An id can be reused after a delete, and the
 * size is what tells the two apart without hashing the archive again. Two different books of
 * exactly the same byte length under the same id would resume slightly off; nothing breaks.
 */

const PREFIX = 'libra.locations.'

function key(bookId: number, byteLength: number): string {
  return `${PREFIX}${bookId}.${byteLength}`
}

/**
 * A measurement with no positions in it is not a measurement, it is a failed one.
 *
 * epub.js answers `[]` when it could not walk the book — a spine it treats as empty, a section
 * it could not load. Keeping that answer is worse than keeping nothing: the next open reads it
 * as a hit, so the book is never measured again and stays at 0% for good.
 */
function isMeasured(stored: string): boolean {
  try {
    const positions: unknown = JSON.parse(stored)
    return Array.isArray(positions) && positions.length > 0
  } catch {
    return false
  }
}

/** What was measured last time, or null when this book has not been measured yet. */
export function loadLocations(bookId: number, byteLength: number): string | null {
  try {
    const stored = localStorage.getItem(key(bookId, byteLength))
    return stored !== null && isMeasured(stored) ? stored : null
  } catch {
    return null
  }
}

/** Keeps a measurement for next time, and gives up quietly when there is no room for it. */
export function saveLocations(bookId: number, byteLength: number, locations: string): void {
  try {
    localStorage.setItem(key(bookId, byteLength), locations)
  } catch {
    // Storage is full or blocked. The book is simply measured again next time.
  }
}
