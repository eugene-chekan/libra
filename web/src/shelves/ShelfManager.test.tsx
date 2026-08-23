import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ApiProvider } from '../api/ApiProvider'
import { fakeBook, fakeShelf, fakeUser, FakeLibraApi } from '../api/FakeLibraApi'
import type { Shelf } from '../api/types'
import { createQueryClient } from '../queryClient'
import { ShelfManager } from './ShelfManager'

/**
 * The dialog against the fake server. The mouse drag is not testable here —
 * `elementFromPoint` answers nothing in jsdom — so it is covered by
 * `e2e/shelves.spec.ts`, and what is checked here is everything else,
 * including the up/down buttons that are the keyboard's way to the same result.
 */
function renderManager(shelves: Shelf[], books = [fakeBook()]) {
  const user = fakeUser({ id: 1, username: 'reader1' })
  const api = new FakeLibraApi({ users: [user], signedInAs: user, shelves, books })
  render(
    <ApiProvider api={api}>
      <QueryClientProvider client={createQueryClient()}>
        <ShelfManager onClose={vi.fn()} />
      </QueryClientProvider>
    </ApiProvider>
  )
  return api
}

const mine = (id: number, name: string, extra: Partial<Shelf> = {}) =>
  fakeShelf({ id, name, owner_id: 1, owner_username: 'reader1', editable: true, ...extra })

describe('ShelfManager', () => {
  it('lists the reader’s shelves and counts them', async () => {
    renderManager([mine(1, 'Reading Now'), mine(2, 'Someday')])

    expect(await screen.findByText('Reading Now')).toBeInTheDocument()
    expect(screen.getByText('2 shelves')).toBeInTheDocument()
  })

  it("never lists somebody else's shelf, because nothing here could be done to it", async () => {
    renderManager([
      mine(1, 'Mine'),
      fakeShelf({ id: 2, name: 'Theirs', owner_id: 2, visibility: 'public', editable: false }),
    ])

    expect(await screen.findByText('Mine')).toBeInTheDocument()
    expect(screen.queryByText('Theirs')).not.toBeInTheDocument()
  })

  it('creates a shelf and clears the box', async () => {
    const user = userEvent.setup()
    const api = renderManager([])
    await screen.findByText('No shelves yet.')

    await user.type(screen.getByLabelText('New shelf'), 'To Read')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('To Read')).toBeInTheDocument()
    expect(api.shelves.map((shelf) => shelf.name)).toEqual(['To Read'])
    await waitFor(() => expect(screen.getByLabelText('New shelf')).toHaveValue(''))
  })

  it('keeps a refused name in the box to be corrected', async () => {
    // A duplicate name comes back 409. Clearing the field on submit would make
    // the reader retype what they just typed.
    const user = userEvent.setup()
    renderManager([mine(1, 'To Read')])
    await screen.findByText('To Read')

    await user.type(screen.getByLabelText('New shelf'), 'to read')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'already have a shelf with that name'
    )
    expect(screen.getByLabelText('New shelf')).toHaveValue('to read')
  })

  it('renames a shelf from the row itself', async () => {
    const user = userEvent.setup()
    const api = renderManager([mine(1, 'Old name')])
    await screen.findByText('Old name')

    await user.click(screen.getByRole('button', { name: 'Edit Old name' }))
    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'New name')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('New name')).toBeInTheDocument()
    expect(api.shelves[0]?.name).toBe('New name')
  })

  it('explains what publishing does, and only when it is about to happen', async () => {
    const user = userEvent.setup()
    renderManager([mine(1, 'Reading Now')])
    await screen.findByText('Reading Now')

    await user.click(screen.getByRole('button', { name: 'Edit Reading Now' }))
    expect(screen.queryByText(/Anyone with an account can see/)).not.toBeInTheDocument()

    await user.click(screen.getByLabelText('Visible to other readers'))
    expect(screen.getByText(/Anyone with an account can see this shelf/)).toBeInTheDocument()
  })

  it('publishes a shelf, and marks it in the list afterwards', async () => {
    const user = userEvent.setup()
    const api = renderManager([mine(1, 'Reading Now')])
    await screen.findByText('Reading Now')

    await user.click(screen.getByRole('button', { name: 'Edit Reading Now' }))
    await user.click(screen.getByLabelText('Visible to other readers'))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Public')).toBeInTheDocument()
    expect(api.shelves[0]?.visibility).toBe('public')
  })

  it('will not save an empty name', async () => {
    const user = userEvent.setup()
    renderManager([mine(1, 'Reading Now')])
    await screen.findByText('Reading Now')

    await user.click(screen.getByRole('button', { name: 'Edit Reading Now' }))
    await user.clear(screen.getByLabelText('Name'))

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('moves a shelf with the buttons, which is the keyboard’s way to reorder', async () => {
    const user = userEvent.setup()
    const api = renderManager([mine(1, 'First'), mine(2, 'Second')])
    await screen.findByText('First')

    await user.click(screen.getByRole('button', { name: 'Move Second up' }))

    await waitFor(() => expect(api.shelves.map((shelf) => shelf.name)).toEqual(['Second', 'First']))
  })

  it('offers no way to move the first row up or the last row down', async () => {
    renderManager([mine(1, 'First'), mine(2, 'Second')])
    await screen.findByText('First')

    expect(screen.getByRole('button', { name: 'Move First up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Second down' })).toBeDisabled()
  })

  it('asks before deleting, and says the books stay', async () => {
    const user = userEvent.setup()
    const api = renderManager([mine(1, 'Reading Now')])
    await screen.findByText('Reading Now')

    await user.click(screen.getByRole('button', { name: 'Delete Reading Now' }))

    expect(await screen.findByRole('dialog', { name: 'Delete Reading Now?' })).toBeInTheDocument()
    expect(screen.getByText(/books on it stay in your library/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(api.shelves).toHaveLength(0))
  })

  it('deletes nothing when the confirmation is refused', async () => {
    const user = userEvent.setup()
    const api = renderManager([mine(1, 'Reading Now')])
    await screen.findByText('Reading Now')

    await user.click(screen.getByRole('button', { name: 'Delete Reading Now' }))
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))

    expect(api.shelves).toHaveLength(1)
  })
})
