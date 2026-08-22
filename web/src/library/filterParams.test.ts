import { describe, expect, it } from 'vitest'

import type { Tag } from '../api/types'
import { mergedTagIds, parseSearchInput } from './filterParams'

describe('parseSearchInput', () => {
  it('treats the whole string as the text query when there are no #tags', () => {
    expect(parseSearchInput('the left hand of darkness')).toEqual({
      textQuery: 'the left hand of darkness',
      hashTagNames: [],
    })
  })

  it('pulls #tag tokens out of the text query and lowercases them', () => {
    expect(parseSearchInput('dune #Sci-Fi #Favorites')).toEqual({
      textQuery: 'dune',
      hashTagNames: ['sci-fi', 'favorites'],
    })
  })

  it('is pure #tags with no leftover text', () => {
    expect(parseSearchInput('#fantasy')).toEqual({ textQuery: '', hashTagNames: ['fantasy'] })
  })

  it('drops a bare # with nothing after it, rather than treating it as a token', () => {
    expect(parseSearchInput('what # is this')).toEqual({
      textQuery: 'what is this',
      hashTagNames: [],
    })
  })

  it('collapses repeated whitespace between words', () => {
    expect(parseSearchInput('dune   #sci-fi   herbert')).toEqual({
      textQuery: 'dune herbert',
      hashTagNames: ['sci-fi'],
    })
  })

  it('treats an empty or whitespace-only string as no query at all', () => {
    expect(parseSearchInput('')).toEqual({ textQuery: '', hashTagNames: [] })
    expect(parseSearchInput('   ')).toEqual({ textQuery: '', hashTagNames: [] })
  })
})

describe('mergedTagIds', () => {
  const tags: Tag[] = [
    { id: 1, name: 'Sci-Fi', owner_id: null, is_global: true },
    { id: 2, name: 'Favorites', owner_id: 9, is_global: false },
  ]

  it('resolves #tag names to ids, case-insensitively', () => {
    expect(mergedTagIds({ hashTagNames: ['sci-fi'], sidebarTagIds: [], allTags: tags })).toEqual([
      1,
    ])
  })

  it('merges sidebar-selected ids with #tag-resolved ids, deduplicated', () => {
    const result = mergedTagIds({ hashTagNames: ['sci-fi'], sidebarTagIds: [1, 2], allTags: tags })
    expect([...result].sort()).toEqual([1, 2])
  })

  it('silently ignores a #tag name that matches nothing, rather than erroring', () => {
    // A typo, or a tag from before it was renamed — the search still runs on
    // whatever *does* match; the endpoint 404s on an id, never a free-text
    // name, so there is no name to look up on the server either.
    expect(
      mergedTagIds({ hashTagNames: ['no-such-tag'], sidebarTagIds: [], allTags: tags })
    ).toEqual([])
  })
})
