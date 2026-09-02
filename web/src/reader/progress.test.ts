import { describe, expect, it } from 'vitest'

import { toPosition, toProgress } from './progress'

describe('progress conversion', () => {
  it('turns a position into a fraction of the whole book', () => {
    expect(toProgress({ index: 1, fraction: 0.5 }, 4)).toBeCloseTo(0.375)
  })

  it('is zero at the very start', () => {
    expect(toProgress({ index: 0, fraction: 0 }, 3)).toBe(0)
  })

  it('is one at the very end', () => {
    expect(toProgress({ index: 2, fraction: 1 }, 3)).toBe(1)
  })

  it('turns a fraction back into a position', () => {
    expect(toPosition(0.375, 4)).toEqual({ index: 1, fraction: 0.5 })
  })

  it('never lands past the last chapter, however it is rounded', () => {
    expect(toPosition(1, 3)).toEqual({ index: 2, fraction: 1 })
  })

  it('treats a book with no chapters as unstarted rather than dividing by zero', () => {
    expect(toProgress({ index: 0, fraction: 0.5 }, 0)).toBe(0)
    expect(toPosition(0.5, 0)).toEqual({ index: 0, fraction: 0 })
  })

  it('round-trips a position through the stored float', () => {
    const there = { index: 2, fraction: 0.25 }

    expect(toPosition(toProgress(there, 5), 5)).toEqual(there)
  })
})
