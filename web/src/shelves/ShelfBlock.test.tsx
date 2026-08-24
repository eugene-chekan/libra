import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { ApiProvider } from '../api/ApiProvider'
import { fakeBook, fakeShelf, fakeUser, FakeLibraApi } from '../api/FakeLibraApi'
import type { Shelf } from '../api/types'
import { createQueryClient } from '../queryClient'
import { bookPath } from '../routes'
import { ShelfBlock } from './ShelfBlock'

function renderBlock(
  shelf: Shelf,
  books = [fakeBook({ id: 7, title: 'Dune', shelf_id: shelf.id })]
) {
  const user = fakeUser({ id: 1 })
  const api = new FakeLibraApi({ users: [user], signedInAs: user, shelves: [shelf], books })
  render(
    <ApiProvider api={api}>
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter>
          <ShelfBlock shelf={shelf} />
        </MemoryRouter>
      </QueryClientProvider>
    </ApiProvider>
  )
  return api
}

describe('ShelfBlock', () => {
  it('names the shelf, and the name opens the library filtered by it', () => {
    renderBlock(fakeShelf({ id: 3, owner_id: 1, name: 'Reading Now', book_count: 1 }))

    expect(screen.getByRole('link', { name: 'Reading Now' })).toHaveAttribute(
      'href',
      '/library?shelf=3'
    )
  })

  it('counts the books, in words that match the number', () => {
    renderBlock(fakeShelf({ id: 3, owner_id: 1, book_count: 1 }))
    expect(screen.getByText('1 book')).toBeInTheDocument()
  })

  it('says "books" for anything but one', () => {
    renderBlock(fakeShelf({ id: 3, owner_id: 1, book_count: 4 }))
    expect(screen.getByText('4 books')).toBeInTheDocument()
  })

  it('shows each book as a link to it, named for a screen reader', async () => {
    renderBlock(fakeShelf({ id: 3, owner_id: 1, book_count: 1 }))

    const link = await screen.findByRole('link', { name: /Dune by An Author/ })
    expect(link).toHaveAttribute('href', bookPath(7))
  })

  it('says a shelf is empty rather than leaving a blank row', async () => {
    renderBlock(fakeShelf({ id: 3, owner_id: 1, book_count: 0 }), [])

    expect(await screen.findByText('Nothing on this shelf yet.')).toBeInTheDocument()
  })

  it('marks a public shelf', () => {
    renderBlock(fakeShelf({ id: 3, owner_id: 1, visibility: 'public' }))
    expect(screen.getByText('Public')).toBeInTheDocument()
  })

  it('leaves a private shelf unlabelled, because private is the norm', () => {
    // Labelling every private shelf would be noise; the pill marks the shelf
    // that is not the norm.
    renderBlock(fakeShelf({ id: 3, owner_id: 1, visibility: 'private' }))
    expect(screen.queryByText('Public')).not.toBeInTheDocument()
  })

  it("says whose shelf it is, but only for somebody else's", () => {
    renderBlock(
      fakeShelf({
        id: 3,
        owner_id: 2,
        owner_username: 'mila',
        visibility: 'public',
        editable: false,
      })
    )

    expect(screen.getByText('· by mila')).toBeInTheDocument()
  })

  it('does not label the reader’s own shelf with their own name', () => {
    renderBlock(fakeShelf({ id: 3, owner_id: 1, owner_username: 'reader1', editable: true }))

    expect(screen.queryByText(/by reader1/)).not.toBeInTheDocument()
  })
})
