import { beforeEach, describe, expect, it, vi } from 'vitest'

import { loadTextSize, saveTextSize } from './textSize'

describe('text size storage', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to medium when nothing is stored', () => {
    expect(loadTextSize()).toBe('medium')
  })

  it('round-trips a saved size', () => {
    saveTextSize('large')

    expect(loadTextSize()).toBe('large')
  })

  it('ignores a stored value that is not a size', () => {
    localStorage.setItem('libra.textSize', 'enormous')

    expect(loadTextSize()).toBe('medium')
  })

  it('survives storage being unavailable', () => {
    // A browser set to block site data throws on access rather than returning
    // null, and a reader with cookies locked down still deserves a book.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })

    expect(loadTextSize()).toBe('medium')
    vi.restoreAllMocks()
  })

  it('does not throw when saving is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })

    expect(() => saveTextSize('small')).not.toThrow()
    vi.restoreAllMocks()
  })
})
