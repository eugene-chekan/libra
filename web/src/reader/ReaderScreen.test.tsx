import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { ApiProvider } from '../api/ApiProvider'
import { fakeBook, fakeUser, FakeLibraApi } from '../api/FakeLibraApi'
import { FakeLibrarianService } from '../librarian/FakeLibrarianService'
import { LibrarianProvider } from '../librarian/LibrarianProvider'
import { LibrarianServiceProvider } from '../librarian/LibrarianServiceContext'
import { createQueryClient } from '../queryClient'
import { readerPath, routes } from '../routes'
import { SessionProvider } from '../session/SessionProvider'
import type { BookReader } from './BookReader'
import { BookReaderProvider } from './BookReaderContext'
import { FakeBookReader } from './FakeBookReader'
import { ReaderScreen } from './ReaderScreen'

function signedInApi(): FakeLibraApi {
  const user = fakeUser({ id: 1 })
  return new FakeLibraApi({
    users: [user],
    signedInAs: user,
    books: [fakeBook({ id: 1, title: 'The Locked Door' })],
  })
}

/** Waits until the book is actually open — the region exists from the first paint now. */
async function opened(title = 'The Locked Door') {
  const region = await screen.findByRole('region', { name: title })
  await waitFor(() => expect(region).toHaveAttribute('aria-busy', 'false'))
  return region
}

/** The one book the fixture holds, so a test can read its state back. */
function onlyBook(api: FakeLibraApi) {
  const book = api.books[0]
  if (!book) throw new Error('the fixture has no book')
  return book
}

function renderReader(reader: BookReader, api: FakeLibraApi = signedInApi()) {
  return render(
    <ApiProvider api={api}>
      <QueryClientProvider client={createQueryClient()}>
        <LibrarianServiceProvider service={new FakeLibrarianService()}>
          <MemoryRouter initialEntries={[readerPath(1)]}>
            <SessionProvider>
              <LibrarianProvider>
                <BookReaderProvider reader={reader}>
                  <Routes>
                    <Route path={routes.reader} element={<ReaderScreen />} />
                  </Routes>
                </BookReaderProvider>
              </LibrarianProvider>
            </SessionProvider>
          </MemoryRouter>
        </LibrarianServiceProvider>
      </QueryClientProvider>
    </ApiProvider>
  )
}

/** Comfortably longer than the reader's write debounce, so a write would have happened. */
const WRITE_WAIT_MS = 1500

describe('ReaderScreen', () => {
  it('marks the reading area busy until the book is open', async () => {
    // The area is in the DOM from the first paint, because epub.js measures it to size the
    // chapter and a hidden box measures zero. `aria-busy` is what actually says "ready".
    renderReader(new FakeBookReader())

    expect(screen.getByRole('region', { name: 'Book' })).toHaveAttribute('aria-busy', 'true')

    const region = await opened()
    expect(region).toHaveAttribute('aria-busy', 'false')
  })

  it('offers a working retry when the download failed', async () => {
    renderReader(new FakeBookReader({ failWith: 'download' }))

    expect(await screen.findByText('Could not reach the server.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('offers no retry when the file cannot be read, because retrying cannot help', async () => {
    renderReader(new FakeBookReader({ failWith: 'parse' }))

    expect(await screen.findByText('This file is not a readable EPUB.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to the book' })).toBeInTheDocument()
  })

  it('retries the open when Try again is pressed', async () => {
    const reader = new FakeBookReader({ failWith: 'download' })
    renderReader(reader)
    await screen.findByRole('button', { name: 'Try again' })

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(reader.calls.filter((c) => c === 'open:1')).toHaveLength(2))
  })

  it('releases the book when it unmounts', async () => {
    const reader = new FakeBookReader()
    const { unmount } = renderReader(reader)
    await opened()

    unmount()

    expect(reader.destroyed).toBe(true)
  })

  it('jumps to a chapter chosen from the contents', async () => {
    const reader = new FakeBookReader()
    renderReader(reader)
    await opened()

    await userEvent.click(screen.getByRole('button', { name: 'Contents' }))
    await userEvent.click(await screen.findByRole('button', { name: 'The End' }))

    expect(reader.calls).toContain('goToChapter:5')
  })

  it('applies a chosen text size and remembers it', async () => {
    localStorage.clear()
    const reader = new FakeBookReader()
    renderReader(reader)
    await opened()

    await userEvent.click(screen.getByRole('button', { name: 'Text size and width' }))
    const sizes = await screen.findByRole('group', { name: 'Text size' })
    await userEvent.click(within(sizes).getByRole('button', { name: 'Large' }))

    expect(reader.appearance.textSize).toBe('large')
    expect(localStorage.getItem('libra.reader.appearance')).toContain('large')
  })

  it('applies a chosen page width, and the menu stays open to try another', async () => {
    // Width and size are things you compare by eye. Closing the menu on every pick would make
    // the reader reopen it to see the difference.
    localStorage.clear()
    const reader = new FakeBookReader()
    renderReader(reader)
    await opened()

    await userEvent.click(screen.getByRole('button', { name: 'Text size and width' }))
    const widths = await screen.findByRole('group', { name: 'Page width' })
    await userEvent.click(within(widths).getByRole('button', { name: 'Wide' }))

    expect(reader.appearance.width).toBe('wide')
    expect(screen.getByRole('group', { name: 'Page width' })).toBeInTheDocument()
  })

  it('writes progress once, after the reader stops scrolling', async () => {
    const reader = new FakeBookReader()
    const api = signedInApi()
    renderReader(reader, api)
    await opened()

    act(() => reader.simulateScroll({ index: 1, progress: 0.2 }))
    act(() => reader.simulateScroll({ index: 1, progress: 0.22 }))
    expect(api.calls.filter((c) => c === 'setBookState:1')).toHaveLength(0)

    await waitFor(() => expect(api.calls.filter((c) => c === 'setBookState:1')).toHaveLength(1), {
      timeout: 3000,
    })
  })

  it('sends progress alone, so the rating survives every scroll', async () => {
    const reader = new FakeBookReader()
    const api = signedInApi()
    onlyBook(api).rating = 4
    renderReader(reader, api)
    await opened()

    act(() => reader.simulateScroll({ index: 5, progress: 1 }))

    await waitFor(() => expect(onlyBook(api).progress).toBe(1), { timeout: 3000 })
    expect(onlyBook(api).rating).toBe(4)
  })

  it('does not write the top of the book over the position it is about to resume to', async () => {
    // Resuming waits for the book to be measured. In that gap the reader sits at the top, and
    // reporting that position wrote a 0 over the stored 9% — so the next open started at the
    // beginning. Nothing may be written until the resume has landed.
    const reader = new FakeBookReader({ slowResume: true })
    const api = signedInApi()
    onlyBook(api).progress = 0.09
    renderReader(reader, api)
    await opened()

    act(() => reader.simulateScroll({ index: 0, progress: 0 }))
    await new Promise((resolve) => setTimeout(resolve, WRITE_WAIT_MS))

    expect(onlyBook(api).progress).toBe(0.09)
    expect(api.calls).not.toContain('setBookState:1')

    await act(async () => reader.finishResume())
    act(() => reader.simulateScroll({ index: 0, progress: 0.11 }))
    await waitFor(() => expect(onlyBook(api).progress).toBe(0.11), { timeout: 3000 })
  })

  it('keeps the stored position when the reader leaves before the resume lands', async () => {
    const reader = new FakeBookReader({ slowResume: true })
    const api = signedInApi()
    onlyBook(api).progress = 0.09
    const { unmount } = renderReader(reader, api)
    await opened()

    act(() => reader.simulateScroll({ index: 0, progress: 0 }))
    unmount()
    // Leaving flushes whatever is pending, and that write is asynchronous — asserting straight
    // after the unmount would pass before it had a chance to land.
    await new Promise((resolve) => setTimeout(resolve, WRITE_WAIT_MS))

    expect(onlyBook(api).progress).toBe(0.09)
  })

  it('opening a book does not move the place it was left at', async () => {
    // Resuming can only land on a position the book was measured at, so it comes back a little
    // short of the one asked for. Writing that back walked the place one step down the book on
    // every open — 40%, then 39.5%, then 38.8% — without anybody reading a word.
    // `slowResume` is what puts the landing where the real one happens: after measuring, with
    // the screen already listening. A resume that lands before that is heard by nobody.
    const reader = new FakeBookReader({ slowResume: true })
    const api = signedInApi()
    onlyBook(api).progress = 0.4
    renderReader(reader, api)
    await opened()

    await act(async () => reader.finishResume())
    await new Promise((resolve) => setTimeout(resolve, WRITE_WAIT_MS))

    expect(onlyBook(api).progress).toBe(0.4)
    expect(api.calls).not.toContain('setBookState:1')
  })

  it('shows the place the book was left at, not the one resuming could reach', async () => {
    // The book page says 40%. Resuming lands on the measured position before that, so
    // reporting the landing made the reader say 39% about the same page.
    const reader = new FakeBookReader({ slowResume: true })
    const api = signedInApi()
    onlyBook(api).progress = 0.4
    renderReader(reader, api)
    await opened()

    await act(async () => reader.finishResume())

    await waitFor(() =>
      expect(screen.getByRole('progressbar', { name: 'Reading progress' })).toHaveAttribute(
        'aria-valuenow',
        '40'
      )
    )
  })

  it('saves the place once the reader has moved away from it', async () => {
    const reader = new FakeBookReader({ slowResume: true })
    const api = signedInApi()
    onlyBook(api).progress = 0.4
    renderReader(reader, api)
    await opened()
    await act(async () => reader.finishResume())

    act(() => reader.simulateScroll({ index: 3, progress: 0.55 }))

    await waitFor(() => expect(onlyBook(api).progress).toBe(0.55), { timeout: 3000 })
  })

  it('resumes where the reader left off', async () => {
    const reader = new FakeBookReader()
    const api = signedInApi()
    onlyBook(api).progress = 0.42
    renderReader(reader, api)

    await waitFor(() => expect(reader.calls).toContain('goTo:0.42'))
  })

  it('shows how far through the book the reader is', async () => {
    const reader = new FakeBookReader()
    renderReader(reader)
    await opened()

    act(() => reader.simulateScroll({ index: 2, progress: 0.5 }))

    expect(screen.getByRole('progressbar', { name: 'Reading progress' })).toHaveAttribute(
      'aria-valuenow',
      '50'
    )
  })
})
