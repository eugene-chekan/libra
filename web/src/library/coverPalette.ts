const PALETTE_SIZE = 12

/** The gradient a book's cover falls back to when it has none of its own. */
export function coverGradient(bookId: number): string {
  const index = (bookId - 1) % PALETTE_SIZE
  return `linear-gradient(155deg, var(--libra-cover-palette-${index}-a) 0%, var(--libra-cover-palette-${index}-b) 100%)`
}
