import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
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

    expect(reader.calls).toContain('goTo:5')
  })

  it('applies a chosen text size and remembers it', async () => {
    localStorage.clear()
    const reader = new FakeBookReader()
    renderReader(reader)
    await opened()

    await userEvent.click(screen.getByRole('button', { name: 'Text size' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Large' }))

    expect(reader.textSize).toBe('large')
    expect(localStorage.getItem('libra.textSize')).toBe('large')
  })

  it('writes progress once, after the reader stops scrolling', async () => {
    const reader = new FakeBookReader()
    const api = signedInApi()
    renderReader(reader, api)
    await opened()

    act(() => reader.simulateScroll({ index: 1, fraction: 0.5 }))
    act(() => reader.simulateScroll({ index: 1, fraction: 0.6 }))
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

    act(() => reader.simulateScroll({ index: 5, fraction: 1 }))

    await waitFor(() => expect(onlyBook(api).progress).toBe(1), { timeout: 3000 })
    expect(onlyBook(api).rating).toBe(4)
  })

  it('resumes where the reader left off', async () => {
    const reader = new FakeBookReader()
    const api = signedInApi()
    onlyBook(api).progress = 3 / 6
    renderReader(reader, api)

    await waitFor(() => expect(reader.calls).toContain('goTo:3'))
  })

  it('shows how far through the book the reader is', async () => {
    const reader = new FakeBookReader()
    renderReader(reader)
    await opened()

    act(() => reader.simulateScroll({ index: 2, fraction: 1 }))

    expect(screen.getByRole('progressbar', { name: 'Reading progress' })).toHaveAttribute(
      'aria-valuenow',
      '50'
    )
  })
})
