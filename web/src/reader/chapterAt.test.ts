import { describe, expect, it } from 'vitest'

import type { Chapter } from './BookReader'
import { chapterAt } from './chapterAt'

// Spine positions, not list positions. Front matter is usually absent from the contents, so
// the third entry is rarely the third section.
const CHAPTERS: Chapter[] = [
  { index: 2, label: 'The Beginning', depth: 0 },
  { index: 3, label: 'The Middle', depth: 0 },
  { index: 5, label: 'The End', depth: 0 },
]

describe('chapterAt', () => {
  it('names the chapter the reader is inside', () => {
    expect(chapterAt(CHAPTERS, 3)).toBe('The Middle')
  })

  it('keeps naming it while the reader is past its start', () => {
    // A chapter can span several spine items, and one spine item can hold several chapters.
    // The entry that covers a position is the last one at or before it.
    expect(chapterAt(CHAPTERS, 4)).toBe('The Middle')
  })

  it('names nothing before the first entry, where the front matter is', () => {
    expect(chapterAt(CHAPTERS, 0)).toBeNull()
  })

  it('does not depend on the contents being in order', () => {
    // Nested contents are walked depth-first, so a part can be listed after a chapter inside
    // it. The entry that covers a position is the nearest one before it, in any order.
    const shuffled: Chapter[] = [CHAPTERS[1]!, CHAPTERS[0]!, CHAPTERS[2]!]

    expect(chapterAt(shuffled, 4)).toBe('The Middle')
  })

  it('names nothing when the book ships no contents', () => {
    // One book in the test library has an empty navigation document.
    expect(chapterAt([], 4)).toBeNull()
  })
})
