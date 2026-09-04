import { beforeEach, describe, expect, it, vi } from 'vitest'

import { loadAppearance, saveAppearance } from './appearance'

describe('appearance storage', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to medium on both when nothing is stored', () => {
    expect(loadAppearance()).toEqual({ textSize: 'medium', width: 'medium' })
  })

  it('round-trips a saved choice', () => {
    saveAppearance({ textSize: 'large', width: 'wide' })

    expect(loadAppearance()).toEqual({ textSize: 'large', width: 'wide' })
  })

  it('ignores a stored value that is not one of the choices', () => {
    localStorage.setItem('libra.reader.appearance', '{"textSize":"enormous","width":"wide"}')

    expect(loadAppearance()).toEqual({ textSize: 'medium', width: 'wide' })
  })

  it('survives stored text that is not JSON at all', () => {
    localStorage.setItem('libra.reader.appearance', 'not json')

    expect(loadAppearance()).toEqual({ textSize: 'medium', width: 'medium' })
  })

  it('survives storage being unavailable', () => {
    // A browser set to block site data throws on access rather than returning null.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })

    expect(loadAppearance()).toEqual({ textSize: 'medium', width: 'medium' })
    vi.restoreAllMocks()
  })

  it('does not throw when saving is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })

    expect(() => saveAppearance({ textSize: 'small', width: 'narrow' })).not.toThrow()
    vi.restoreAllMocks()
  })
})
