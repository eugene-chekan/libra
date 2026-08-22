import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { ApiProvider } from '../api/ApiProvider'
import { fakeBook, fakeShelf, fakeTag, fakeUser, FakeLibraApi } from '../api/FakeLibraApi'
import { createQueryClient } from '../queryClient'
import { LibraryScreen } from './LibraryScreen'

function renderAt(path: string, api: FakeLibraApi) {
  return render(
    <ApiProvider api={api}>
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={[path]}>
          <LibraryScreen />
        </MemoryRouter>
      </QueryClientProvider>
    </ApiProvider>
  )
}

function signedInApi(overrides: ConstructorParameters<typeof FakeLibraApi>[0] = {}) {
  const user = fakeUser()
  return new FakeLibraApi({ users: [user], signedInAs: user, ...overrides })
}

describe('LibraryScreen', () => {
  it('shows the title and the book count once loaded', async () => {
    const api = signedInApi({ books: [fakeBook(), fakeBook()] })

    renderAt('/library', api)

    expect(screen.getByRole('heading', { name: 'Library' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('2 books')).toBeInTheDocument())
  })

  it('filters as the reader types, reading the result back from the server', async () => {
    const user = userEvent.setup()
    // has_cover: true on both — otherwise BookCover's own gradient fallback
    // repeats each title as decoration, and getByText finds two of each.
    const api = signedInApi({
      books: [
        fakeBook({ title: 'Dune', author: 'Herbert', has_cover: true }),
        fakeBook({ title: 'Emma', author: 'Austen', has_cover: true }),
      ],
    })

    renderAt('/library', api)
    await waitFor(() => expect(screen.getByText('2 books')).toBeInTheDocument())

    await user.type(screen.getByRole('textbox'), 'dune')

    await waitFor(() => expect(screen.getByText('1 books')).toBeInTheDocument())
    expect(screen.getByText('Dune')).toBeInTheDocument()
    expect(screen.queryByText('Emma')).not.toBeInTheDocument()
  })

  it('reads shelf and tag filters from the URL and shows them as pills', async () => {
    const user = fakeUser()
    // owner_id: user.id explicitly — fakeShelf()'s own default owner is not
    // guaranteed to match whichever id fakeUser() happened to hand out here,
    // and an unowned, non-public shelf 404s rather than filtering quietly.
    const shelf = fakeShelf({ name: 'Currently Reading', owner_id: user.id })
    const tag = fakeTag({ name: 'Sci-Fi' })
    const api = new FakeLibraApi({
      users: [user],
      signedInAs: user,
      shelves: [shelf],
      tags: [tag],
      books: [fakeBook({ title: 'Dune', has_cover: true, shelf_id: shelf.id, tag_ids: [tag.id] })],
    })

    renderAt(`/library?shelf=${shelf.id}&tags=${tag.id}`, api)

    await waitFor(() => expect(screen.getByText('Currently Reading')).toBeInTheDocument())
    expect(screen.getByText('Sci-Fi')).toBeInTheDocument()
    expect(screen.getByText('(OR)')).toBeInTheDocument()
    expect(screen.getByText('Dune')).toBeInTheDocument()
  })

  it('resolves a typed #tag token against the loaded tag list and filters by it', async () => {
    const user = userEvent.setup()
    const tag = fakeTag({ name: 'sci-fi' })
    const api = signedInApi({
      tags: [tag],
      books: [
        fakeBook({ title: 'Dune', has_cover: true, tag_ids: [tag.id] }),
        fakeBook({ title: 'Emma', has_cover: true, tag_ids: [] }),
      ],
    })

    renderAt('/library', api)
    await waitFor(() => expect(screen.getByText('2 books')).toBeInTheDocument())

    await user.type(screen.getByRole('textbox'), '#sci-fi')

    await waitFor(() => expect(screen.getByText('1 books')).toBeInTheDocument())
    expect(screen.getByText('Dune')).toBeInTheDocument()
  })

  it('shows the plain search-empty line when a filter matches nothing', async () => {
    const user = userEvent.setup()
    const api = signedInApi({ books: [fakeBook({ title: 'Dune' })] })

    renderAt('/library', api)
    await waitFor(() => expect(screen.getByText('1 books')).toBeInTheDocument())

    await user.type(screen.getByRole('textbox'), 'nothing matches this')

    await waitFor(() => expect(screen.getByText('No books match your search.')).toBeInTheDocument())
  })

  it('shows the first-run empty state when the whole library is empty', async () => {
    const api = signedInApi({ books: [] })

    renderAt('/library', api)

    await waitFor(() => expect(screen.getByText('Your library is empty')).toBeInTheDocument())
  })

  it('shows an error block with a retry when the request fails', async () => {
    const api = new FakeLibraApi() // signed out — 401s

    renderAt('/library', api)

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })
})
