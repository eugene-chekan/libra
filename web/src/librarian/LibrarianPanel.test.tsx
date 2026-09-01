import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { ApiProvider } from '../api/ApiProvider'
import { fakeBook, fakeUser, FakeLibraApi } from '../api/FakeLibraApi'
import type { Conversation } from '../api/types'
import { createQueryClient } from '../queryClient'
import { FakeLibrarianService } from './FakeLibrarianService'
import { LibrarianPanel } from './LibrarianPanel'
import { LibrarianProvider, useLibrarian } from './LibrarianProvider'
import type { LibrarianService } from './LibrarianService'
import { LibrarianServiceProvider } from './LibrarianServiceContext'

/** Opens the panel on mount and renders a marker for whatever route is active — the
 *  stand-in for "the page underneath" a citation click should land on. */
function AutoOpen() {
  const { open } = useLibrarian()
  useEffect(() => {
    open()
    // Runs once, on mount: `open` is a fresh function identity every render of
    // `LibrarianProvider`, and depending on it would re-open on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

/** `getConversation()` always rejects — exercises the panel's own load-error rendering,
 *  not just the provider's state (`LibrarianProvider.test.tsx` already covers that). */
class FailingConversationService extends FakeLibrarianService {
  async getConversation(): Promise<Conversation> {
    throw new Error('Could not reach the server.')
  }
}

function renderPanel({
  books = [{ id: 1, title: 'Dune' }],
  service,
}: {
  books?: { id: number; title: string }[]
  service?: LibrarianService
} = {}) {
  const user = fakeUser()
  const api = new FakeLibraApi({
    users: [user],
    signedInAs: user,
    books: books.map((book) => fakeBook(book)),
  })
  render(
    <MemoryRouter initialEntries={['/library']}>
      <ApiProvider api={api}>
        <QueryClientProvider client={createQueryClient()}>
          <LibrarianServiceProvider service={service ?? new FakeLibrarianService({ books })}>
            <LibrarianProvider>
              <AutoOpen />
              <LibrarianPanel />
              <Routes>
                <Route path="/library" element={<div>Library page</div>} />
                <Route path="/books/:id" element={<div>Book page</div>} />
              </Routes>
            </LibrarianProvider>
          </LibrarianServiceProvider>
        </QueryClientProvider>
      </ApiProvider>
    </MemoryRouter>
  )
}

describe('LibrarianPanel', () => {
  it('shows the header, the stub badge, and the explanatory line', async () => {
    renderPanel()
    // Lets the background `useBooks()` fetch settle, so it doesn't land — and warn — mid-way
    // through whichever test runs next.
    await act(async () => {})
    expect(screen.getByRole('heading', { name: 'Librarian' })).toBeInTheDocument()
    expect(screen.getByText('NOT CONNECTED')).toBeInTheDocument()
    expect(
      screen.getByText("The librarian isn't connected yet — replies below are canned examples.")
    ).toBeInTheDocument()
  })

  it('shows suggestion rows with a real book title substituted in', async () => {
    renderPanel({ books: [{ id: 1, title: 'Dune' }] })
    // The book-templated suggestions come from `useBooks()`, an async fetch — give it
    // a tick to resolve before asserting on its result.
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'What should I read next?' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'What are the main themes in Dune?' })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Find me something like Dune.' })).toBeInTheDocument()
  })

  it('hides the two book-templated suggestions when the library is empty', async () => {
    renderPanel({ books: [] })
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'What should I read next?' })).toBeInTheDocument()
    expect(screen.queryByText(/main themes/)).not.toBeInTheDocument()
  })

  it('shows a load-error card instead of the empty state, when the conversation fails to load', async () => {
    renderPanel({ service: new FailingConversationService({ books: [] }) })

    expect(
      await screen.findByText("Couldn't load your conversation with the librarian.")
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'What should I read next?' })
    ).not.toBeInTheDocument()
  })

  it('clicking a suggestion sends it and renders the streamed reply', async () => {
    const user = userEvent.setup()
    renderPanel({ books: [{ id: 1, title: 'Dune' }] })

    await user.click(screen.getByRole('button', { name: 'What should I read next?' }))

    expect(await screen.findByText('What should I read next?')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByText(/Dune looks like a good next read/)).toBeInTheDocument()
    )
  })

  it('shows the tool-call status while searching, then collapses it', async () => {
    const user = userEvent.setup()
    renderPanel({ books: [{ id: 1, title: 'Dune' }] })

    await user.click(screen.getByRole('button', { name: 'What should I read next?' }))

    await waitFor(() => expect(screen.getByText(/Searched your library/)).toBeInTheDocument())
  })

  it('renders a citation chip that navigates to the book, keeping the panel open', async () => {
    const user = userEvent.setup()
    renderPanel({ books: [{ id: 1, title: 'Dune' }] })

    await user.click(screen.getByRole('button', { name: 'What should I read next?' }))
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Cited book' })).toBeInTheDocument()
    )

    await user.click(screen.getByRole('link', { name: 'Cited book' }))

    expect(await screen.findByText('Book page')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Librarian' })).toBeInTheDocument()
  })

  it('shows the unavailable error card, with a Try again button', async () => {
    const user = userEvent.setup()
    renderPanel({ books: [] })

    await user.click(screen.getByRole('button', { name: 'What should I read next?' }))
    // Second message triggers the fake's unavailable path.
    const composer = screen.getByPlaceholderText('Ask about your library…')
    await user.type(composer, 'make the librarian unavailable')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByText('The librarian is unavailable right now.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it("disables the send button while empty, and enables it once there's text", async () => {
    const user = userEvent.setup()
    renderPanel()

    const send = screen.getByRole('button', { name: 'Send' })
    expect(send).toBeDisabled()

    await user.type(screen.getByPlaceholderText('Ask about your library…'), 'hello')
    expect(send).toBeEnabled()
  })

  it('Enter sends; Shift+Enter inserts a newline', async () => {
    const user = userEvent.setup()
    renderPanel({ books: [{ id: 1, title: 'Dune' }] })

    const composer = screen.getByPlaceholderText('Ask about your library…')
    await user.type(composer, 'next?')
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    expect(composer).toHaveValue('next?\n')

    await user.type(composer, '{Enter}')
    expect(await screen.findByText(/looks like a good next read/)).toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    renderPanel()
    expect(screen.getByRole('heading', { name: 'Librarian' })).toBeInTheDocument()

    await user.keyboard('{Escape}')

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Librarian' })).not.toBeInTheDocument()
    )
  })
})
