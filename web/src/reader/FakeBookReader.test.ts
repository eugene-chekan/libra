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
    expect(book.chapters.map((c) => c.label)).toEqual(['The Beginning', 'The Middle', 'The End'])
  })

  it('points its contents at spine positions, not at positions in the list', async () => {
    // The defect this exists to stop: mapping contents entries to 0, 1, 2 works on a fixture
    // and sends a real reader to the title page when they ask for chapter three.
    const reader = new FakeBookReader()

    const book = await reader.open(1, host())

    expect(book.chapters.map((c) => c.index)).toEqual([2, 3, 5])
  })

  it('starts at the beginning', async () => {
    const reader = new FakeBookReader()
    await reader.open(1, host())

    expect(reader.position()).toEqual({ index: 0, progress: 0 })
  })

  it('resumes to a little short of the fraction asked for, as the real one does', async () => {
    // It can only land on a position the book was measured at, and it takes the one before.
    const reader = new FakeBookReader()
    await reader.open(1, host())

    await reader.goTo(0.42)

    expect(reader.position().progress).toBeLessThan(0.42)
    expect(reader.position().progress).toBeGreaterThan(0.41)
    expect(reader.calls).toContain('goTo:0.42')
  })

  it('goes to the start of a chapter, which is a different thing from a fraction', async () => {
    const reader = new FakeBookReader()
    await reader.open(1, host())

    await reader.goToChapter(3)

    expect(reader.position().index).toBe(3)
    expect(reader.calls).toContain('goToChapter:3')
  })

  it('tells listeners when the position changes, and stops when unsubscribed', async () => {
    const reader = new FakeBookReader()
    await reader.open(1, host())
    const seen = vi.fn()
    const stop = reader.onMove(seen)

    reader.simulateScroll({ index: 1, progress: 0.25 })
    stop()
    reader.simulateScroll({ index: 2, progress: 0.75 })

    expect(seen).toHaveBeenCalledTimes(1)
    expect(seen).toHaveBeenCalledWith({ index: 1, progress: 0.25 })
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

  it('refuses a chapter past the end of the book', async () => {
    const reader = new FakeBookReader()
    await reader.open(1, host())

    await expect(reader.goToChapter(9)).rejects.toThrow()
  })

  it('refuses a progress outside 0 to 1', async () => {
    const reader = new FakeBookReader()
    await reader.open(1, host())

    await expect(reader.goTo(1.5)).rejects.toThrow()
    await expect(reader.goTo(-0.1)).rejects.toThrow()
  })
})
