import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
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
  it('shows the book once it opens', async () => {
    renderReader(new FakeBookReader())

    expect(await screen.findByRole('region', { name: 'The Locked Door' })).toBeInTheDocument()
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
    await screen.findByRole('region', { name: 'The Locked Door' })

    unmount()

    expect(reader.destroyed).toBe(true)
  })

  it('jumps to a chapter chosen from the contents', async () => {
    const reader = new FakeBookReader()
    renderReader(reader)
    await screen.findByRole('region', { name: 'The Locked Door' })

    await userEvent.click(screen.getByRole('button', { name: 'Contents' }))
    await userEvent.click(await screen.findByRole('button', { name: 'The End' }))

    expect(reader.calls).toContain('goTo:2')
  })

  it('applies a chosen text size and remembers it', async () => {
    localStorage.clear()
    const reader = new FakeBookReader()
    renderReader(reader)
    await screen.findByRole('region', { name: 'The Locked Door' })

    await userEvent.click(screen.getByRole('button', { name: 'Text size' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Large' }))

    expect(reader.textSize).toBe('large')
    expect(localStorage.getItem('libra.textSize')).toBe('large')
  })
})
