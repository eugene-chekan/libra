const PALETTE_SIZE = 12

/** The colour of the dot beside a tag's name, worked out from the name itself. */
export function tagColour(name: string): string {
  // djb2. Folded back to 32 bits each round so the running value stays exact
  // in a double, which it would not past 2^53.
  let hash = 5381
  for (const character of name.toLowerCase()) {
    hash = (hash * 33 + character.charCodeAt(0)) >>> 0
  }
  return `var(--libra-cover-palette-${hash % PALETTE_SIZE}-a)`
}
