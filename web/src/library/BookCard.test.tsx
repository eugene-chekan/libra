import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ApiProvider } from '../api/ApiProvider'
import { fakeBook, FakeLibraApi } from '../api/FakeLibraApi'
import { BookCard } from './BookCard'

function renderCard(overrides: Parameters<typeof fakeBook>[0] = {}) {
  return render(
    <ApiProvider api={new FakeLibraApi()}>
      <BookCard book={fakeBook({ title: 'Piranesi', author: 'Susanna Clarke', ...overrides })} />
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
})
