import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { ApiProvider } from '../api/ApiProvider'
import { fakeBook, fakeShelf, fakeUser, FakeLibraApi } from '../api/FakeLibraApi'
import type { Book } from '../api/types'
import { readerPath } from '../routes'
import { BookActions } from './BookActions'

function renderActions(
  overrides: Partial<Parameters<typeof BookActions>[0]> = {},
  book: Book = fakeBook({ id: 4 })
) {
  const user = fakeUser()
  const api = new FakeLibraApi({ users: [user], signedInAs: user, books: [book] })
  const props = {
    book,
    shelves: [] as ReturnType<typeof fakeShelf>[],
    canEdit: false,
    hasKindleAddress: true,
    onEdit: vi.fn(),
    onMoveToShelf: vi.fn(),
    onSendToKindle: vi.fn().mockResolvedValue(undefined),
    onSetUpKindle: vi.fn(),
    ...overrides,
  }

  render(
    <ApiProvider api={api}>
      <MemoryRouter>
        <BookActions {...props} />
      </MemoryRouter>
    </ApiProvider>
  )
  return props
}

describe('BookActions', () => {
  it('labels the primary button for where the reader already is', () => {
    renderActions({}, fakeBook({ id: 4, progress: 0 }))
    expect(screen.getByRole('link', { name: 'Start Reading' })).toBeInTheDocument()
  })

  it('says Continue Reading partway through', () => {
    renderActions({}, fakeBook({ id: 4, progress: 0.4 }))
    expect(screen.getByRole('link', { name: 'Continue Reading' })).toBeInTheDocument()
  })

  it('says Read Again for a finished book', () => {
    renderActions({}, fakeBook({ id: 4, progress: 1 }))
    expect(screen.getByRole('link', { name: 'Read Again' })).toBeInTheDocument()
  })

  it('sends the primary button to the reader, not to the download', () => {
    // The label promises reading. Pointing it at a file in a downloads folder
    // would be a small lie, and it is why the reader exists at all.
    renderActions({}, fakeBook({ id: 4 }))

    expect(screen.getByRole('link', { name: 'Start Reading' })).toHaveAttribute(
      'href',
      readerPath(4)
    )
  })

  it('downloads through a plain link to the file endpoint', () => {
    renderActions({}, fakeBook({ id: 4 }))

    const download = screen.getByRole('link', { name: /Download/ })
    expect(download).toHaveAttribute('href', '/api/books/4/file')
    expect(download).toHaveAttribute('download')
  })

  it('offers Edit Book only to a reader who may edit the catalog', () => {
    renderActions({ canEdit: false })
    expect(screen.queryByRole('button', { name: 'Edit Book' })).not.toBeInTheDocument()
  })

  it('opens the edit form when an admin asks for it', async () => {
    const user = userEvent.setup()
    const { onEdit } = renderActions({ canEdit: true })

    await user.click(screen.getByRole('button', { name: 'Edit Book' }))

    expect(onEdit).toHaveBeenCalled()
  })
})
