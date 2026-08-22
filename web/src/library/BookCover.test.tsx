import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ApiProvider } from '../api/ApiProvider'
import { FakeLibraApi } from '../api/FakeLibraApi'
import { BookCover } from './BookCover'

function renderCover(props: Partial<Parameters<typeof BookCover>[0]> = {}) {
  return render(
    <ApiProvider api={new FakeLibraApi()}>
      <BookCover id={1} title="Dune" hasCover={false} {...props} />
    </ApiProvider>
  )
}

describe('BookCover', () => {
  it('renders an image from the cover endpoint when the book has one', () => {
    renderCover({ id: 7, hasCover: true })

    const img = screen.getByRole('img', { name: 'Dune' })
    expect(img).toHaveAttribute('src', '/api/books/7/cover')
  })

  it('draws the gradient fallback, with the title, when the book has no cover', () => {
    renderCover({ hasCover: false })

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('Dune')).toBeInTheDocument()
  })

  it('falls back to the gradient if the cover image itself fails to load', () => {
    // has_cover can lie in the narrow window between the file changing and
    // the catalog catching up — the client has to cope with a 404 it did not
    // expect, not just the case the server told it about in advance.
    renderCover({ hasCover: true })

    const img = screen.getByRole('img', { name: 'Dune' })
    fireEvent.error(img)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('Dune')).toBeInTheDocument()
  })
})
