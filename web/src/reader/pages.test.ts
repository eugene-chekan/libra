import { describe, expect, it } from 'vitest'

import { pagesAt } from './pages'

// A paperback page holds roughly 1,800 characters, so 180,000 characters is about 100 pages.
const HUNDRED_PAGES = 180_000

describe('pagesAt', () => {
  it('turns a length of text into a number of pages', () => {
    expect(pagesAt(0, HUNDRED_PAGES)?.total).toBe(100)
  })

  it('starts at page one, not page zero', () => {
    expect(pagesAt(0, HUNDRED_PAGES)?.current).toBe(1)
  })

  it('counts from how much text is behind the reader', () => {
    expect(pagesAt(HUNDRED_PAGES / 2, HUNDRED_PAGES)?.current).toBe(50)
  })

  it('never goes past the last page', () => {
    // A length that does not divide evenly: the total rounds down to 99 while the last page
    // counts up to 100, which would read "page 100 of 99" without the cap.
    const AWKWARD = 179_000

    expect(pagesAt(AWKWARD, AWKWARD)).toEqual({ current: 99, total: 99 })
  })

  it('knows nothing about a book that has not been measured', () => {
    expect(pagesAt(0, 0)).toBeNull()
  })

  it('gives a very short book one page rather than none', () => {
    expect(pagesAt(0, 200)).toEqual({ current: 1, total: 1 })
  })
})
