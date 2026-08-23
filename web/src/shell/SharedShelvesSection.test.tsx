import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { ApiProvider } from '../api/ApiProvider'
import { fakeShelf, fakeUser, FakeLibraApi } from '../api/FakeLibraApi'
import type { Shelf } from '../api/types'
import { createQueryClient } from '../queryClient'
import { SharedShelvesSection } from './SharedShelvesSection'

function renderSection(shelves: Shelf[], path = '/library') {
  const user = fakeUser({ id: 1 })
  const api = new FakeLibraApi({ users: [user], signedInAs: user, shelves })
  render(
    <ApiProvider api={api}>
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={[path]}>
          <SharedShelvesSection />
        </MemoryRouter>
      </QueryClientProvider>
    </ApiProvider>
  )
}

const theirs = (id: number, name: string, owner = 'mila') =>
  fakeShelf({ id, name, owner_id: 2, owner_username: owner, visibility: 'public' })

describe('SharedShelvesSection', () => {
  it('does not exist at all when nobody has shared anything', () => {
    // On a single-user instance — the common case — an empty section
    // explaining that nobody shared anything would be worse than no section.
    renderSection([fakeShelf({ id: 1, owner_id: 1 })])

    expect(screen.queryByRole('button', { name: /shared with you/i })).not.toBeInTheDocument()
  })

  it('starts collapsed, because it is secondary to the reader’s own shelves', async () => {
    renderSection([theirs(2, 'Winter Reading')])

    const header = await screen.findByRole('button', { name: /shared with you/i })
    expect(header).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Winter Reading')).not.toBeInTheDocument()
  })

  it('lists a shared shelf and says whose it is', async () => {
    const user = userEvent.setup()
    renderSection([theirs(2, 'Winter Reading', 'mila')])

    await user.click(await screen.findByRole('button', { name: /shared with you/i }))

    expect(screen.getByText('Winter Reading')).toBeInTheDocument()
    expect(screen.getByText('by mila')).toBeInTheDocument()
  })

  it('filters the library by a shared shelf, the same as any other', async () => {
    const user = userEvent.setup()
    renderSection([theirs(2, 'Winter Reading')])

    await user.click(await screen.findByRole('button', { name: /shared with you/i }))

    expect(screen.getByRole('link', { name: /Winter Reading/ })).toHaveAttribute(
      'href',
      '/library?shelf=2'
    )
  })

  it('clears the filter when the shelf already filtering the grid is clicked again', async () => {
    const user = userEvent.setup()
    renderSection([theirs(2, 'Winter Reading')], '/library?shelf=2')

    await user.click(await screen.findByRole('button', { name: /shared with you/i }))

    const row = screen.getByRole('link', { name: /Winter Reading/ })
    expect(row).toHaveAttribute('aria-current', 'true')
    expect(row).toHaveAttribute('href', '/library')
  })

  it("never lists the reader's own shelves, which have their own section", async () => {
    const user = userEvent.setup()
    renderSection([fakeShelf({ id: 1, owner_id: 1, name: 'Mine' }), theirs(2, 'Theirs')])

    await user.click(await screen.findByRole('button', { name: /shared with you/i }))

    expect(screen.getByText('Theirs')).toBeInTheDocument()
    expect(screen.queryByText('Mine')).not.toBeInTheDocument()
  })
})
