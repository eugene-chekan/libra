import { describe, expect, it } from 'vitest'

import { coverGradient } from './coverPalette'

describe('coverGradient', () => {
  it('picks the same gradient for the same book id every time', () => {
    expect(coverGradient(5)).toEqual(coverGradient(5))
  })

  it('wraps around after the twelve palettes, so id 13 matches id 1', () => {
    expect(coverGradient(13)).toEqual(coverGradient(1))
  })

  it('gives adjacent ids different gradients', () => {
    expect(coverGradient(1)).not.toEqual(coverGradient(2))
  })

  it('reads the colour pair from the CSS custom properties, not a hardcoded hex', () => {
    // The project's own rule: no colour lives outside tokens.css. This is
    // what makes that checkable — the value here must be a var(), never a hex.
    expect(coverGradient(1)).toMatch(
      /^linear-gradient\(155deg, var\(--libra-cover-palette-0-a\) 0%, var\(--libra-cover-palette-0-b\) 100%\)$/
    )
  })
})
