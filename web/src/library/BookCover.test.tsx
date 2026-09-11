import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ApiProvider } from '../api/ApiProvider'
import { FakeLibraApi } from '../api/FakeLibraApi'
import { BookCover } from './BookCover'

type Props = Parameters<typeof BookCover>[0]

function cover(props: Partial<Props>) {
  return <BookCover id={1} title="Dune" coverVersion={null} {...props} />
}

function renderCover(props: Partial<Props> = {}) {
  const api = new FakeLibraApi()
  const view = render(<ApiProvider api={api}>{cover(props)}</ApiProvider>)
  return {
    rerenderWith: (next: Partial<Props>) =>
      view.rerender(<ApiProvider api={api}>{cover(next)}</ApiProvider>),
  }
}

describe('BookCover', () => {
  it('draws the picture from an address that names its version', () => {
    // A new picture gets a new address. With one fixed address the browser keeps drawing the
    // picture it already has (#124).
    renderCover({ id: 7, coverVersion: 'v1' })

    expect(screen.getByRole('img', { name: 'Dune' })).toHaveAttribute(
      'src',
      '/api/books/7/cover?v=v1'
    )
  })

  it('draws the gradient fallback, with the title, when the book has no cover', () => {
    renderCover({ coverVersion: null })

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('Dune')).toBeInTheDocument()
  })

  it('falls back to the gradient if the cover image itself fails to load', () => {
    // The catalog can be wrong in the short time between the file changing and the catalog
    // catching up. The client has to cope with a 404 it did not expect.
    renderCover({ coverVersion: 'v1' })

    fireEvent.error(screen.getByRole('img', { name: 'Dune' }))

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('Dune')).toBeInTheDocument()
  })

  it('tries a new picture even after the last one failed to load', () => {
    // A failure belongs to one address. Remembered for the whole book instead, it would keep a
    // cover set after a failed one hidden until the page reloaded.
    const { rerenderWith } = renderCover({ coverVersion: 'v1' })
    fireEvent.error(screen.getByRole('img', { name: 'Dune' }))

    rerenderWith({ coverVersion: 'v2' })

    expect(screen.getByRole('img', { name: 'Dune' })).toHaveAttribute(
      'src',
      '/api/books/1/cover?v=v2'
    )
  })
})
