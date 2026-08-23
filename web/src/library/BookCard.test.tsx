import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { ApiProvider } from '../api/ApiProvider'
import { fakeBook, FakeLibraApi } from '../api/FakeLibraApi'
import { bookPath } from '../routes'
import { BookCard } from './BookCard'

function renderCard(overrides: Parameters<typeof fakeBook>[0] = {}) {
  return render(
    <ApiProvider api={new FakeLibraApi()}>
      <MemoryRouter>
        <BookCard book={fakeBook({ title: 'Piranesi', author: 'Susanna Clarke', ...overrides })} />
      </MemoryRouter>
    </ApiProvider>
  )
}

describe('BookCard', () => {
  it('shows the title and author as real text', () => {
    // has_cover: true so BookCover renders an <img alt="Piranesi"> rather
    // than its own decorative title text — this test is about the card's
    // own title and author lines, not about disambiguating from those.
    renderCard({ has_cover: true })

    expect(screen.getByText('Piranesi')).toBeInTheDocument()
    expect(screen.getByText('Susanna Clarke')).toBeInTheDocument()
  })

  it("shows the book's cover", () => {
    renderCard({ id: 3, has_cover: true })

    expect(screen.getByRole('img', { name: 'Piranesi' })).toHaveAttribute(
      'src',
      '/api/books/3/cover'
    )
  })

  it('shows the status line for the given progress', () => {
    renderCard({ progress: 0.5, rating: 0 })

    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  it('is a link to the book, so a cell can be opened in a new tab or bookmarked', () => {
    renderCard({ id: 3, has_cover: true })

    // The path comes from the same helper the router uses. A path typed out
    // again here is a second copy that will drift.
    expect(screen.getByRole('link')).toHaveAttribute('href', bookPath(3))
  })
})
