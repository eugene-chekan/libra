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

/** Comfortably longer than the write debounce, so a write would have happened by now. */
const WRITE_WAIT_MS = 1500

async function settle(ms = WRITE_WAIT_MS) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
}

describe('ReaderScreen', () => {
  it('marks the reading area busy until the book is open', async () => {
    // The area is in the DOM from the first paint, because epub.js measures it to size the
    // page and a hidden box measures zero. `aria-busy` is what actually says "ready".
    renderReader(new FakeBookReader())

    expect(screen.getByRole('region', { name: 'Book' })).toHaveAttribute('aria-busy', 'true')

    expect(await opened()).toHaveAttribute('aria-busy', 'false')
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

  it('turns a page forward, and back again', async () => {
    const reader = new FakeBookReader()
    renderReader(reader)
    await opened()

    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await waitFor(() => expect(reader.position().index).toBe(1))
    await userEvent.click(screen.getByRole('button', { name: 'Previous page' }))

    await waitFor(() => expect(reader.position().index).toBe(0))
  })

  it('will not turn back from the first page', async () => {
    const reader = new FakeBookReader()
    renderReader(reader)
    await opened()

    expect(await screen.findByRole('button', { name: 'Previous page' })).toBeDisabled()
  })

  it('jumps to a chapter chosen from the contents', async () => {
    const reader = new FakeBookReader()
    renderReader(reader)
    await opened()

    await userEvent.click(screen.getByRole('button', { name: 'Contents' }))
    await userEvent.click(await screen.findByRole('button', { name: 'The End' }))

    expect(reader.calls).toContain('goToChapter:5')
  })

  it('names the chapter the reader is in, beside the book', async () => {
    const reader = new FakeBookReader()
    renderReader(reader)
    await opened()

    await userEvent.click(screen.getByRole('button', { name: 'Contents' }))
    await userEvent.click(await screen.findByRole('button', { name: 'The Middle' }))

    expect(await screen.findByText('· The Middle')).toBeInTheDocument()
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

  it('shows no percentage while the book has not been measured', async () => {
    renderReader(new FakeBookReader({ unmeasured: true }))
    await opened()

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('saves where a page turn landed, once the turning stops', async () => {
    const reader = new FakeBookReader()
    const api = signedInApi()
    renderReader(reader, api)
    await opened()

    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(api.calls).not.toContain('setBookState:1')
    await settle()

    expect(onlyBook(api).position).toBe('page:1')
  })

  it('resumes from the stored address, exactly', async () => {
    const reader = new FakeBookReader()
    const api = signedInApi()
    onlyBook(api).position = 'page:6'
    onlyBook(api).progress = 0.66
    renderReader(reader, api)
    await opened()

    await waitFor(() => expect(reader.calls).toContain('goTo:page:6'))
    expect(reader.position().index).toBe(6)
  })

  it('opening a book saves nothing at all', async () => {
    // Resuming is not reading. Writing what a resume landed on is what walked a book's place
    // one step down the page on every open, and what wrote a 0 over it when a resume missed.
    const reader = new FakeBookReader()
    const api = signedInApi()
    onlyBook(api).position = 'page:6'
    onlyBook(api).progress = 0.66
    renderReader(reader, api)
    await opened()
    await waitFor(() => expect(reader.calls).toContain('goTo:page:6'))

    await settle()

    expect(api.calls).not.toContain('setBookState:1')
    expect(onlyBook(api).position).toBe('page:6')
    expect(onlyBook(api).progress).toBe(0.66)
  })

  it('resumes a book stored before addresses were kept, and still saves nothing', async () => {
    const reader = new FakeBookReader()
    const api = signedInApi()
    onlyBook(api).progress = 0.4
    renderReader(reader, api)
    await opened()

    await waitFor(() => expect(reader.calls).toContain('goToProgress:0.40'))
    await settle()

    expect(api.calls).not.toContain('setBookState:1')
    expect(onlyBook(api).progress).toBe(0.4)
  })

  it('finishes the book on its last page', async () => {
    const reader = new FakeBookReader()
    const api = signedInApi()
    onlyBook(api).position = 'page:8'
    renderReader(reader, api)
    await opened()
    await waitFor(() => expect(reader.calls).toContain('goTo:page:8'))

    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await settle()

    expect(onlyBook(api).progress).toBe(1)
  })

  it('will not turn forward from the last page', async () => {
    const reader = new FakeBookReader()
    const api = signedInApi()
    onlyBook(api).position = 'page:9'
    renderReader(reader, api)
    await opened()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled())
  })
})
