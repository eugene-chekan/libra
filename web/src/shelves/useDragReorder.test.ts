import { describe, expect, it } from 'vitest'

import { moveWithin, sameOrder } from './useDragReorder'

/**
 * The arithmetic of the drag, on its own.
 *
 * The pointer half needs a real browser — `elementFromPoint` answers nothing
 * in jsdom — so it is covered by `e2e/shelves.spec.ts`, which drives an actual
 * mouse. What is tested here is the part with the off-by-one in it.
 */
describe('moveWithin', () => {
  it('moves a row down, past the row it was dropped on', () => {
    expect(moveWithin([1, 2, 3, 4], 1, 3)).toEqual([2, 3, 1, 4])
  })

  it('moves a row up, above the row it was dropped on', () => {
    expect(moveWithin([1, 2, 3, 4], 4, 2)).toEqual([1, 4, 2, 3])
  })

  it('moves a row to the very top', () => {
    expect(moveWithin([1, 2, 3], 3, 1)).toEqual([3, 1, 2])
  })

  it('moves a row to the very bottom', () => {
    expect(moveWithin([1, 2, 3], 1, 3)).toEqual([2, 3, 1])
  })

  it('changes nothing when a row is dropped on itself', () => {
    expect(moveWithin([1, 2, 3], 2, 2)).toEqual([1, 2, 3])
  })

  it('changes nothing when the target is not in the list', () => {
    expect(moveWithin([1, 2, 3], 2, 99)).toEqual([1, 2, 3])
  })

  it('keeps every id, and only reorders them', () => {
    const before = [5, 6, 7, 8]
    const after = moveWithin(before, 7, 5)

    expect([...after].sort()).toEqual([...before].sort())
    expect(after).toHaveLength(before.length)
  })
})

describe('sameOrder', () => {
  it('is true only for the same ids in the same places', () => {
    expect(sameOrder([1, 2, 3], [1, 2, 3])).toBe(true)
    expect(sameOrder([1, 2, 3], [3, 2, 1])).toBe(false)
    expect(sameOrder([1, 2], [1, 2, 3])).toBe(false)
  })
})
