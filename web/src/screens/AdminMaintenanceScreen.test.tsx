import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { ApiProvider } from '../api/ApiProvider'
import { ApiError } from '../api/errors'
import { fakeBook, fakeUser, FakeLibraApi } from '../api/FakeLibraApi'
import { createQueryClient } from '../queryClient'
import { AdminMaintenanceScreen } from './AdminMaintenanceScreen'

type Options = NonNullable<ConstructorParameters<typeof FakeLibraApi>[0]>

function renderScreen(overrides: Omit<Options, 'users' | 'signedInAs'> = {}) {
  const admin = fakeUser({ is_admin: true })
  const api = new FakeLibraApi({ users: [admin], signedInAs: admin, ...overrides })
  render(
    <ApiProvider api={api}>
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter>
          <AdminMaintenanceScreen />
        </MemoryRouter>
      </QueryClientProvider>
    </ApiProvider>
  )
  return api
}

const stray = { name: 'stray.epub', size_bytes: 2048, modified_at: '2026-09-01T10:00:00Z' }

describe('AdminMaintenanceScreen', () => {
  it('counts what the installation holds, with the size in words', async () => {
    renderScreen({ books: [fakeBook(), fakeBook()], libraryFiles: [stray] })

    // Scoped to its own tile: 2048 bytes reads as "2.0 KB" in the total *and* against the file
    // that makes it up, and an unscoped query cannot tell which it found.
    const tile = (label: string) => screen.getByText(label).closest('div')

    expect(await screen.findByText('Books')).toBeInTheDocument()
    expect(tile('Books')).toHaveTextContent('2')
    expect(tile('On disk')).toHaveTextContent('2.0 KB')
  })

  it('says so plainly when there is nothing to clean up', async () => {
    renderScreen()

    expect(await screen.findByText('Nothing loose on disk.')).toBeInTheDocument()
    expect(screen.getByText('Every book has its file.')).toBeInTheDocument()
    expect(screen.getByText('None to clear.')).toBeInTheDocument()
  })

  /* Deleting a file may be deleting the only copy of a book, so it asks first. */
  it('asks before deleting an orphan, and deletes nothing while the question is up', async () => {
    const user = userEvent.setup()
    const api = renderScreen({ libraryFiles: [stray] })

    await user.click(await screen.findByRole('button', { name: 'Delete stray.epub' }))

    expect(await screen.findByRole('dialog', { name: 'Delete stray.epub?' })).toBeInTheDocument()
    expect(api.calls).not.toContain('deleteOrphan:stray.epub')
  })

  it('deletes the orphan once, and it leaves the list', async () => {
    const user = userEvent.setup()
    const api = renderScreen({ libraryFiles: [stray] })

    await user.click(await screen.findByRole('button', { name: 'Delete stray.epub' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(api.calls).toContain('deleteOrphan:stray.epub'))
    expect(await screen.findByText('Nothing loose on disk.')).toBeInTheDocument()
  })

  it('offers to prune only when something has expired', async () => {
    renderScreen({ expiredSessions: 0 })
    expect(await screen.findByText('None to clear.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Prune' })).not.toBeInTheDocument()
  })

  it('counts expired sessions in words that match the number', async () => {
    renderScreen({ expiredSessions: 1 })

    expect(await screen.findByText('1 session has expired.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Prune' })).toBeInTheDocument()
  })

  it('links a book whose file is gone, so it can be looked at', async () => {
    renderScreen({ missingFiles: [{ id: 7, title: 'Dune', file_path: 'gone.epub' }] })

    expect(await screen.findByRole('link', { name: 'Dune' })).toHaveAttribute('href', '/books/7')
    expect(screen.getByText('gone.epub')).toBeInTheDocument()
  })

  it('shows the server’s own words when an action fails', async () => {
    const user = userEvent.setup()
    const api = renderScreen()
    api.vacuum = () => Promise.reject(new ApiError(409, 'Database is locked'))
    await screen.findByText('Nothing loose on disk.')

    await user.click(screen.getByRole('button', { name: 'Vacuum' }))

    expect(await screen.findByText('Database is locked')).toBeInTheDocument()
  })

  /* A file a book points at is never offered for deletion — but a book can arrive between the
     report and the click, and the fake refuses that exactly as the server does. */
  it('never lists a file a book still points at as an orphan', async () => {
    const api = renderScreen({ libraryFiles: [{ ...stray, usedByBook: true }] })

    expect(await screen.findByText('Nothing loose on disk.')).toBeInTheDocument()
    await expect(api.deleteOrphan(stray.name)).rejects.toMatchObject({ status: 409 })
  })
})
