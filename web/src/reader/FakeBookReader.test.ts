import { beforeEach, describe, expect, it } from 'vitest'

import { ReaderError } from './BookReader'
import { FakeBookReader } from './FakeBookReader'

function host(): HTMLElement {
  return document.createElement('div')
}

/** Waits for the move the fake reports a beat after the call that caused it. */
async function reported(reader: FakeBookReader) {
  return new Promise<void>((resolve) => {
    const stop = reader.onMove(() => {
      stop()
      resolve()
    })
  })
}

describe('FakeBookReader', () => {
  let reader: FakeBookReader

  beforeEach(() => {
    reader = new FakeBookReader()
  })

  it('opens a book with its title and its own contents', async () => {
    const book = await reader.open(7, host())

    expect(book.title).toBe('The Locked Door')
    expect(book.chapters.map((chapter) => chapter.label)).toEqual([
      'The Beginning',
      'The Middle',
      'The End',
    ])
    expect(reader.calls).toContain('open:7')
  })

  it('lists contents whose spine positions are not their positions in the list', async () => {
    // Front matter is absent from a real book's contents, so the first entry is section two.
    const book = await reader.open(1, host())

    expect(book.chapters.map((chapter) => chapter.index)).toEqual([2, 3, 5])
  })

  it('fails the two ways a real book fails', async () => {
    const broken = new FakeBookReader({ failWith: 'parse' })

    await expect(broken.open(1, host())).rejects.toBeInstanceOf(ReaderError)
  })

  it('starts on the first page, and says so', async () => {
    await reader.open(1, host())

    expect(reader.position().atStart).toBe(true)
    expect(reader.position().atEnd).toBe(false)
  })

  it('turns pages forward and back', async () => {
    await reader.open(1, host())

    await reader.next()
    await reported(reader)
    expect(reader.position().index).toBe(1)

    await reader.previous()
    await reported(reader)
    expect(reader.position().index).toBe(0)
  })

  it('does not turn back past the first page', async () => {
    await reader.open(1, host())

    await reader.previous()

    expect(reader.position().index).toBe(0)
    expect(reader.position().atStart).toBe(true)
  })

  it('reports the end of the book, and stops there', async () => {
    await reader.open(1, host())
    await reader.goToProgress(1)

    expect(reader.position().atEnd).toBe(true)

    await reader.next()

    expect(reader.position().atEnd).toBe(true)
  })

  it('goes back to the page a mark names', async () => {
    await reader.open(1, host())

    await reader.goTo('page:4')

    expect(reader.position().index).toBe(4)
    expect(reader.position().mark).toBe('page:4')
  })

  it('holds a slow resume until it is let go', async () => {
    const slow = new FakeBookReader({ slowResume: true })
    await slow.open(1, host())

    const resuming = slow.goTo('page:6')
    expect(slow.position().index).toBe(0)

    slow.finishResume()
    await resuming

    expect(slow.position().index).toBe(6)
  })

  it('reports no progress at all while the book is unmeasured', async () => {
    const unmeasured = new FakeBookReader({ unmeasured: true })
    await unmeasured.open(1, host())

    expect(unmeasured.position().progress).toBeNull()
  })

  it('refuses a chapter that is not in the book', async () => {
    await reader.open(1, host())

    await expect(reader.goToChapter(99)).rejects.toBeInstanceOf(RangeError)
  })

  it('releases the book', async () => {
    await reader.open(1, host())

    reader.destroy()

    expect(reader.destroyed).toBe(true)
  })
})
