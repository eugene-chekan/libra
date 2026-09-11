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
import { setViewportWidth } from '../test/viewport'
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

  it('shows how many pages in the reader is', async () => {
    const reader = new FakeBookReader()
    renderReader(reader)
    await opened()

    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))

    expect(await screen.findByText('p. 2 of 10')).toBeInTheDocument()
  })

  it('shows no percentage while the book has not been measured', async () => {
    renderReader(new FakeBookReader({ unmeasured: true }))
    await opened()

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.queryByText(/^p\./)).not.toBeInTheDocument()
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

  describe('tapping to turn the page on a phone', () => {
    /** Opens the reader at a phone width and hands back the fake to tap. */
    async function onAPhone() {
      setViewportWidth(390)
      const reader = new FakeBookReader()
      renderReader(reader)
      await opened()
      return reader
    }

    it('turns forward when the tap lands in the right third', async () => {
      const reader = await onAPhone()

      act(() => reader.tapAt(0.9))

      await waitFor(() => expect(reader.calls).toContain('next'))
    })

    it('turns back when the tap lands in the left third', async () => {
      const reader = await onAPhone()
      act(() => reader.tapAt(0.9))
      await waitFor(() => expect(reader.calls).toContain('next'))

      act(() => reader.tapAt(0.1))

      await waitFor(() => expect(reader.calls).toContain('previous'))
    })

    it('does nothing anywhere in the middle third', async () => {
      // The middle is where somebody reading rests a thumb, and where they tap to dismiss a
      // menu. Turning the page there would move the book when they meant to hold it still.
      //
      // 0.4 and 0.6 rather than only 0.5: dead centre is the one point that stays still
      // however wide the zones grow, so a test using it alone pins nothing about where the
      // edges are. These two are inside the middle third and outside a wider one.
      const reader = await onAPhone()

      act(() => {
        reader.tapAt(0.4)
        reader.tapAt(0.5)
        reader.tapAt(0.6)
      })

      await settle(0)
      expect(reader.calls).not.toContain('next')
      expect(reader.calls).not.toContain('previous')
    })

    it('puts the page turns in the bar, where a screen reader can still reach them', async () => {
      // A tap zone is a listener, not an element, so nothing finds it without sight. The
      // arrows are what keep the reader usable, and on a phone they move out of the margin
      // rather than disappearing.
      const reader = await onAPhone()

      const bar = within(screen.getByRole('banner'))
      expect(bar.getByRole('button', { name: 'Previous page' })).toBeInTheDocument()
      expect(bar.getByRole('button', { name: 'Next page' })).toBeInTheDocument()
      void reader
    })

    it('leaves the page turns beside the text on a wider window', async () => {
      setViewportWidth(1280)
      renderReader(new FakeBookReader())
      await opened()

      // Still reachable by name — they have only moved.
      expect(screen.getByRole('button', { name: 'Next page' })).toBeInTheDocument()
      expect(
        within(screen.getByRole('banner')).queryByRole('button', { name: 'Next page' })
      ).not.toBeInTheDocument()
    })

    it('ignores taps on a window wider than a phone', async () => {
      // A mouse has the arrows and the keyboard. Clicking the text to turn the page there
      // would be a surprise, not a shortcut.
      setViewportWidth(1280)
      const reader = new FakeBookReader()
      renderReader(reader)
      await opened()

      act(() => reader.tapAt(0.9))

      await settle(0)
      expect(reader.calls).not.toContain('next')
    })
  })

  describe('coming back after following a link inside the book', () => {
    /** Opens the book on page 4, the page a link will leave. Opening saves nothing. */
    async function readingPageFour() {
      const reader = new FakeBookReader()
      const api = signedInApi()
      onlyBook(api).position = 'page:3'
      renderReader(reader, api)
      await opened()
      await waitFor(() => expect(reader.calls).toContain('goTo:page:3'))
      return { reader, api }
    }

    it('offers no way back before a link is followed', async () => {
      await readingPageFour()

      expect(screen.queryByRole('button', { name: /^Back to/ })).not.toBeInTheDocument()
    })

    it('offers the way back after a link, naming the page it left', async () => {
      const { reader } = await readingPageFour()

      act(() => reader.followLink(8))

      expect(await screen.findByRole('button', { name: 'Back to page 4' })).toBeInTheDocument()
    })

    it('goes back to the exact page it left, saves it, and puts the button away', async () => {
      const { reader, api } = await readingPageFour()
      act(() => reader.followLink(8))

      await userEvent.click(await screen.findByRole('button', { name: 'Back to page 4' }))
      await settle()

      expect(reader.position().index).toBe(3)
      expect(api.calls).toContain('setBookState:1')
      expect(onlyBook(api).position).toBe('page:3')
      expect(screen.queryByRole('button', { name: /^Back to/ })).not.toBeInTheDocument()
    })

    it('saves nothing while away, even when a page is turned there', async () => {
      // A note can run over several pages. The saved place stays the page the link left, so
      // opening the book again goes back there rather than to the notes.
      const { reader, api } = await readingPageFour()
      act(() => reader.followLink(8))
      await screen.findByRole('button', { name: 'Back to page 4' })

      await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
      await settle()

      expect(reader.position().index).toBe(9)
      expect(api.calls).not.toContain('setBookState:1')
      expect(screen.getByRole('button', { name: 'Back to page 4' })).toBeInTheDocument()
    })

    it('saves the page a link leaves when a page turn just before it is still waiting', async () => {
      // A turn saves a second after it lands. A link followed inside that second must not let
      // the waiting save store the notes instead of the page that turn landed on.
      const { reader, api } = await readingPageFour()

      await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
      await waitFor(() => expect(reader.position().index).toBe(4))
      act(() => reader.followLink(8))
      await settle()

      expect(onlyBook(api).position).toBe('page:4')
    })

    it('writes nothing more when a link follows a save that has already landed', async () => {
      const { reader, api } = await readingPageFour()
      await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
      await settle()
      expect(api.calls.filter((call) => call === 'setBookState:1')).toHaveLength(1)

      act(() => reader.followLink(8))
      await settle()

      expect(api.calls.filter((call) => call === 'setBookState:1')).toHaveLength(1)
    })

    it('keeps the first way back when a second link is followed', async () => {
      const { reader } = await readingPageFour()
      act(() => reader.followLink(8))
      await screen.findByRole('button', { name: 'Back to page 4' })

      act(() => reader.followLink(6))
      await settle(0)

      expect(screen.getByRole('button', { name: 'Back to page 4' })).toBeInTheDocument()
    })

    it('stays on the page on screen when asked to, and saves it', async () => {
      const { reader, api } = await readingPageFour()
      act(() => reader.followLink(8))
      await screen.findByRole('button', { name: 'Back to page 4' })

      await userEvent.click(screen.getByRole('button', { name: 'Stay here' }))
      await settle()

      expect(screen.queryByRole('button', { name: /^Back to/ })).not.toBeInTheDocument()
      expect(onlyBook(api).position).toBe('page:8')
    })

    it('drops the way back when a chapter is chosen from the contents', async () => {
      const { reader, api } = await readingPageFour()
      act(() => reader.followLink(8))
      await screen.findByRole('button', { name: 'Back to page 4' })

      await userEvent.click(screen.getByRole('button', { name: 'Contents' }))
      await userEvent.click(await screen.findByRole('button', { name: 'The End' }))
      await settle()

      expect(screen.queryByRole('button', { name: /^Back to/ })).not.toBeInTheDocument()
      expect(onlyBook(api).position).toBe('page:5')
    })
  })
})
