import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { ApiProvider } from '../api/ApiProvider'
import { fakeBook, fakeShelf, fakeUser, FakeLibraApi } from '../api/FakeLibraApi'
import type { Shelf } from '../api/types'
import { createQueryClient } from '../queryClient'
import { ShelvesScreen } from './ShelvesScreen'

function renderScreen(shelves: Shelf[], books = [fakeBook()]) {
  const user = fakeUser({ id: 1, username: 'reader1' })
  const api = new FakeLibraApi({ users: [user], signedInAs: user, shelves, books })
  render(
    <ApiProvider api={api}>
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter>
          <ShelvesScreen />
        </MemoryRouter>
      </QueryClientProvider>
    </ApiProvider>
  )
  return api
}

const mine = (id: number, name: string) =>
  fakeShelf({ id, name, owner_id: 1, owner_username: 'reader1' })

const theirs = (id: number, name: string) =>
  fakeShelf({ id, name, owner_id: 2, owner_username: 'mila', visibility: 'public' })

describe('ShelvesScreen', () => {
  it('lists the shelves in the order the server sent them, never re-sorted', async () => {
    // That order is the reader's own arrangement, and it is the one thing
    // about this screen they control. Sorting by name here would throw it
    // away and nothing would look wrong.
    renderScreen([mine(1, 'Zebra'), mine(2, 'Alpha')])

    const names = await screen.findAllByRole('link', { name: /Zebra|Alpha/ })
    expect(names.map((link) => link.textContent)).toEqual(['Zebra', 'Alpha'])
  })

  it('separates other readers’ shelves under their own heading', async () => {
    renderScreen([mine(1, 'Mine'), theirs(2, 'Theirs')])

    expect(await screen.findByRole('heading', { name: 'Shared with you' })).toBeInTheDocument()
    expect(screen.getByText('· by mila')).toBeInTheDocument()
  })

  it('has no shared heading at all on a single-user instance', async () => {
    renderScreen([mine(1, 'Mine')])

    await screen.findByRole('link', { name: 'Mine' })
    expect(screen.queryByRole('heading', { name: 'Shared with you' })).not.toBeInTheDocument()
  })

  it('offers one thing to do when there are no shelves at all', async () => {
    renderScreen([])

    expect(await screen.findByText('No shelves yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New Shelf' })).toBeInTheDocument()
    // The header's Manage Shelves would be a second door to the same room.
    expect(screen.queryByRole('button', { name: 'Manage Shelves' })).not.toBeInTheDocument()
  })

  it('opens the manager from the empty state', async () => {
    const user = userEvent.setup()
    renderScreen([])
    await screen.findByText('No shelves yet')

    await user.click(screen.getByRole('button', { name: 'New Shelf' }))

    expect(await screen.findByRole('dialog', { name: 'Manage Shelves' })).toBeInTheDocument()
  })

  it('opens the manager from the header once there are shelves', async () => {
    const user = userEvent.setup()
    renderScreen([mine(1, 'Reading Now')])
    await screen.findByRole('link', { name: 'Reading Now' })

    await user.click(screen.getByRole('button', { name: 'Manage Shelves' }))

    expect(await screen.findByRole('dialog', { name: 'Manage Shelves' })).toBeInTheDocument()
  })

  it('shows a new shelf on the page as soon as the manager creates it', async () => {
    const user = userEvent.setup()
    renderScreen([mine(1, 'Reading Now')])
    await screen.findByRole('link', { name: 'Reading Now' })

    await user.click(screen.getByRole('button', { name: 'Manage Shelves' }))
    await user.type(await screen.findByLabelText('New shelf'), 'Someday')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await screen.findByText('2 shelves')
    await user.click(screen.getByRole('button', { name: 'Close' }))

    // The page re-read the list because the write invalidated it, not because
    // anything here told it to. (While the dialog is open Radix hides the rest
    // of the page from assistive technology, so this has to be asserted after
    // it closes.)
    await waitFor(() => expect(screen.getByRole('link', { name: 'Someday' })).toBeInTheDocument())
  })

  it('reports a failure to load, with a way to try again', async () => {
    const api = new FakeLibraApi({ users: [], signedInAs: null })
    render(
      <ApiProvider api={api}>
        <QueryClientProvider client={createQueryClient()}>
          <MemoryRouter>
            <ShelvesScreen />
          </MemoryRouter>
        </QueryClientProvider>
      </ApiProvider>
    )

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument()
  })
})
