import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ApiProvider } from '../api/ApiProvider'
import { fakeBook, fakeUser, FakeLibraApi } from '../api/FakeLibraApi'
import type { FakeBook } from '../api/FakeLibraApi'
import { createQueryClient } from '../queryClient'
import { CoverSection } from './CoverSection'

/**
 * The cover control inside the Edit Book form. Every rule it shows is one the
 * server keeps: only an admin may set a cover, and a refused link comes back
 * carrying the server's own sentence. It also commits at once, unlike the form
 * around it, so the section says so on screen.
 */
function renderSection(options: { book?: Partial<FakeBook>; coverFailure?: string } = {}) {
  const admin = fakeUser({ id: 1, is_admin: true })
  const book = fakeBook({ id: 1, has_cover: true, ...options.book })
  const api = new FakeLibraApi({
    users: [admin],
    signedInAs: admin,
    books: [book],
    coverFailure: options.coverFailure ?? null,
  })
  render(
    <ApiProvider api={api}>
      <QueryClientProvider client={createQueryClient()}>
        <CoverSection book={book} />
      </QueryClientProvider>
    </ApiProvider>
  )
  return { api, book }
}

describe('CoverSection', () => {
  it('says that a cover applies at once, because the form around it does not', async () => {
    renderSection()

    expect(screen.getByText(/applies straight away/i)).toBeInTheDocument()
  })

  it('sets a cover from a chosen file', async () => {
    const { api } = renderSection()
    const file = new File(['x'], 'c.jpg', { type: 'image/jpeg' })

    await userEvent.upload(screen.getByLabelText(/choose a picture/i), file)

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/cover updated/i))
    expect(api.calls).toContain('setCover:1')
  })

  it('sets a cover from a link', async () => {
    renderSection()

    await userEvent.type(screen.getByLabelText(/link/i), 'https://example.com/c.jpg')
    await userEvent.click(screen.getByRole('button', { name: /use this link/i }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/cover updated/i))
  })

  it('shows the server’s own sentence when a link is refused', async () => {
    renderSection({ coverFailure: 'that address is inside a private network' })

    await userEvent.type(screen.getByLabelText(/link/i), 'https://sneaky.example/c.jpg')
    await userEvent.click(screen.getByRole('button', { name: /use this link/i }))

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/inside a private network/i)
    )
  })

  it('offers the book’s own cover again only when a custom one is set', async () => {
    renderSection({ book: { has_cover: false } })
    expect(screen.queryByRole('button', { name: /book’s own cover/i })).not.toBeInTheDocument()
  })
})
