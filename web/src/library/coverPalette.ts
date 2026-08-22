const PALETTE_SIZE = 12

/**
 * The gradient a book's cover falls back to when it has none of its own.
 *
 * Deterministic per id — `(bookId - 1) % 12` — so the same book always draws
 * the same gradient rather than a new random one on every load, which is the
 * only property that makes "no cover" read as a placeholder rather than a
 * glitch. The twelve colour pairs themselves live in tokens.css, never here:
 * this function returns `var(...)` references, not hex values, so the
 * project's "no colour outside tokens.css" rule stays checkable by grep.
 */
export function coverGradient(bookId: number): string {
  const index = (bookId - 1) % PALETTE_SIZE
  return `linear-gradient(155deg, var(--libra-cover-palette-${index}-a) 0%, var(--libra-cover-palette-${index}-b) 100%)`
}
