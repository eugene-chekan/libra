import { describe, expect, it, vi } from 'vitest'

import { ReaderError } from './BookReader'
import { FakeBookReader } from './FakeBookReader'

function host(): HTMLElement {
  return document.createElement('div')
}

describe('FakeBookReader', () => {
  it('opens a book and reports its chapters', async () => {
    const reader = new FakeBookReader()

    const book = await reader.open(1, host())

    expect(book.title).toBe('The Locked Door')
    expect(book.chapterCount).toBe(6)
    expect(book.chapters.map((c) => c.label)).toEqual(['The Beginning', 'The Middle', 'The End'])
  })

  it('points its contents at spine positions, not at positions in the list', async () => {
    // The defect this exists to stop: mapping contents entries to 0, 1, 2 works on a fixture
    // and sends a real reader to the title page when they ask for chapter three.
    const reader = new FakeBookReader()

    const book = await reader.open(1, host())

    expect(book.chapters.map((c) => c.index)).toEqual([2, 3, 5])
    expect(book.chapterCount).toBeGreaterThan(book.chapters.length)
  })

  it('starts at the beginning', async () => {
    const reader = new FakeBookReader()
    await reader.open(1, host())

    expect(reader.position()).toEqual({ index: 0, fraction: 0 })
  })

  it('moves to a position and reports it back', async () => {
    const reader = new FakeBookReader()
    await reader.open(1, host())

    await reader.goTo({ index: 2, fraction: 0.5 })

    expect(reader.position()).toEqual({ index: 2, fraction: 0.5 })
  })

  it('tells listeners when the position changes, and stops when unsubscribed', async () => {
    const reader = new FakeBookReader()
    await reader.open(1, host())
    const seen = vi.fn()
    const stop = reader.onMove(seen)

    reader.simulateScroll({ index: 1, fraction: 0.25 })
    stop()
    reader.simulateScroll({ index: 2, fraction: 0.75 })

    expect(seen).toHaveBeenCalledTimes(1)
    expect(seen).toHaveBeenCalledWith({ index: 1, fraction: 0.25 })
  })

  it('throws a download error when told to, which is the retryable kind', async () => {
    const reader = new FakeBookReader({ failWith: 'download' })

    await expect(reader.open(1, host())).rejects.toMatchObject({ kind: 'download' })
    await expect(reader.open(1, host())).rejects.toBeInstanceOf(ReaderError)
  })

  it('throws a parse error for a book it cannot read, which is not retryable', async () => {
    const reader = new FakeBookReader({ failWith: 'parse' })

    await expect(reader.open(1, host())).rejects.toMatchObject({ kind: 'parse' })
  })

  it('refuses a position past the end of the book', async () => {
    const reader = new FakeBookReader()
    await reader.open(1, host())

    await expect(reader.goTo({ index: 9, fraction: 0 })).rejects.toThrow()
  })
})
