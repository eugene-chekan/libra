import { describe, expect, it } from 'vitest'

import { tagColour } from './tagColour'

describe('tagColour', () => {
  it('gives the same name the same colour every time', () => {
    expect(tagColour('favourites')).toBe(tagColour('favourites'))
  })

  it('ignores case, because two names differing only by case are one tag', () => {
    expect(tagColour('Sci-Fi')).toBe(tagColour('sci-fi'))
  })

  it('only ever returns a token reference, never a colour of its own', () => {
    // The rule the whole project follows: no colour outside tokens.css, so a
    // theme change is one file rather than a hunt.
    for (const name of ['favourites', 'sci-fi', 'lent-out', 'to-re-read', '']) {
      expect(tagColour(name)).toMatch(/^var\(--libra-cover-palette-([0-9]|1[01])-a\)$/)
    }
  })

  it('does not hand every tag the same colour', () => {
    // A hash that collapsed would pass every test above and still make the
    // dots useless, which is the only thing they are for.
    const names = ['favourites', 'sci-fi', 'lent-out', 'to-re-read', 'fantasy', 'history']
    const colours = new Set(names.map(tagColour))

    expect(colours.size).toBeGreaterThan(1)
  })

  it('is not derived from position: a tag keeps its colour as the list changes', () => {
    // The reason this is hashed at all. An index would repaint a tag's
    // neighbours every time one was added ahead of it.
    const before = ['sci-fi', 'fantasy'].map(tagColour)
    const after = ['history', 'sci-fi', 'fantasy'].map(tagColour)

    expect(after.slice(1)).toEqual(before)
  })
})
