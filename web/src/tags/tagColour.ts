const PALETTE_SIZE = 12

/**
 * The colour of the dot beside a tag's name, worked out from the name itself.
 *
 * **Hashed rather than taken from the row's position.** The list interleaves
 * global and personal tags in the server's order, so an index would repaint a
 * tag's neighbours every time one was added or deleted — the reader would see
 * colours shuffle for tags they never touched. A hash of the name is stable,
 * needs no column on the table, and gives one tag the same dot everywhere it
 * appears.
 *
 * Lower-cased first, because tag names are unique without regard to case: a
 * rename from "Sci-Fi" to "sci-fi" is the same tag and keeps its colour.
 *
 * A colour the reader picks is a real feature and can have a real column when
 * somebody asks for one. The twelve values are the cover palette's first
 * stops, which is where the prototype's tag colours came from — and they are
 * `var(...)` references rather than hex, so "no colour outside tokens.css"
 * stays checkable with grep.
 */
export function tagColour(name: string): string {
  // djb2. Folded back to 32 bits each round so the running value stays exact
  // in a double, which it would not past 2^53.
  let hash = 5381
  for (const character of name.toLowerCase()) {
    hash = (hash * 33 + character.charCodeAt(0)) >>> 0
  }
  return `var(--libra-cover-palette-${hash % PALETTE_SIZE}-a)`
}
