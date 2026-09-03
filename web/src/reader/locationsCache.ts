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

/** What was measured last time, or null when this book has not been measured yet. */
export function loadLocations(bookId: number, byteLength: number): string | null {
  try {
    return localStorage.getItem(key(bookId, byteLength))
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
