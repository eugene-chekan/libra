import type { Tag } from '../api/types'

/** One search box, two token types — the split client-design.md specifies. */
export interface ParsedSearchInput {
  /** Bare words, ANDed against title or author. */
  textQuery: string
  /** Lowercased `#tag` tokens, resolved to ids and ORed with the sidebar selection. */
  hashTagNames: string[]
}

/**
 * Splits raw search box text into its two token types.
 *
 * A bare `#` with nothing after it is not a token — `#` alone would resolve
 * to an empty tag name that matches nothing, which is a worse failure mode
 * than just leaving it out of both lists.
 */
export function parseSearchInput(raw: string): ParsedSearchInput {
  const words = raw.trim().split(/\s+/).filter(Boolean)
  const textWords: string[] = []
  const hashTagNames: string[] = []

  for (const word of words) {
    if (word.startsWith('#') && word.length > 1) {
      hashTagNames.push(word.slice(1).toLowerCase())
    } else if (word !== '#') {
      textWords.push(word)
    }
  }

  return { textQuery: textWords.join(' '), hashTagNames }
}

interface MergedTagIdsParams {
  hashTagNames: string[]
  sidebarTagIds: number[]
  allTags: Tag[]
}

/**
 * Resolves typed `#tag` names to ids and merges them with the sidebar's own
 * selection into the one id list `GET /books` takes. A name matching nothing
 * — a typo, a since-renamed tag — is dropped rather than erroring: the
 * endpoint 404s on an unrecognised *id*, never on free text, so there is
 * nothing to look up on the server's side either.
 */
export function mergedTagIds({
  hashTagNames,
  sidebarTagIds,
  allTags,
}: MergedTagIdsParams): number[] {
  const resolved = hashTagNames
    .map((name) => allTags.find((tag) => tag.name.toLowerCase() === name)?.id)
    .filter((id): id is number => id !== undefined)

  return [...new Set([...sidebarTagIds, ...resolved])]
}
