import { beforeEach, describe, expect, it, vi } from 'vitest'

import { loadLocations, saveLocations } from './locationsCache'

describe('locations cache', () => {
  beforeEach(() => localStorage.clear())

  it('has nothing for a book that has not been measured', () => {
    expect(loadLocations(1, 5000)).toBeNull()
  })

  it('round-trips a measurement', () => {
    saveLocations(1, 5000, '["cfi/1","cfi/2"]')

    expect(loadLocations(1, 5000)).toBe('["cfi/1","cfi/2"]')
  })

  it('does not hand one book the measurement of another', () => {
    saveLocations(1, 5000, 'first')

    expect(loadLocations(2, 5000)).toBeNull()
  })

  it('does not reuse a measurement when the file behind the id changed size', () => {
    // Ids are reused after a delete, so the same id can hold a different book. Resuming into
    // the wrong place is the failure this avoids.
    saveLocations(1, 5000, 'first')

    expect(loadLocations(1, 9000)).toBeNull()
  })

  it('survives storage being unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })

    expect(loadLocations(1, 5000)).toBeNull()
    vi.restoreAllMocks()
  })

  it('does not throw when there is no room to save', () => {
    // A measurement is worth keeping, not worth failing a reader over.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })

    expect(() => saveLocations(1, 5000, 'x')).not.toThrow()
    vi.restoreAllMocks()
  })
})
