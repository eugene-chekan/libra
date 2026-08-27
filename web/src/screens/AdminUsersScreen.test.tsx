import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { ApiProvider } from '../api/ApiProvider'
import { fakeUser, FakeLibraApi } from '../api/FakeLibraApi'
import type { FakeUser } from '../api/FakeLibraApi'
import { createQueryClient } from '../queryClient'
import { SessionProvider } from '../session/SessionProvider'
import { AdminUsersScreen } from './AdminUsersScreen'

function renderScreen(admin: FakeUser, users: FakeUser[] = [admin]) {
  const api = new FakeLibraApi({ users, signedInAs: admin })
  render(
    <MemoryRouter initialEntries={['/admin/users']}>
      <ApiProvider api={api}>
        <QueryClientProvider client={createQueryClient()}>
          <SessionProvider>
            <AdminUsersScreen />
          </SessionProvider>
        </QueryClientProvider>
      </ApiProvider>
    </MemoryRouter>
  )
  return api
}

describe('AdminUsersScreen', () => {
  it("lists every account, with its Kindle address or the fallback", async () => {
    const admin = fakeUser({
      id: 1,
      username: 'admin',
      is_admin: true,
      kindle_email: 'admin@kindle.com',
    })
    const reader = fakeUser({ id: 2, username: 'reader', kindle_email: null })
    renderScreen(admin, [admin, reader])

    await screen.findByText('admin')
    expect(screen.getByText('admin@kindle.com')).toBeInTheDocument()
    expect(screen.getByText('reader')).toBeInTheDocument()
    expect(screen.getByText('No Kindle address')).toBeInTheDocument()
  })

  it('marks an administrator, and does not mark an ordinary reader', async () => {
    const admin = fakeUser({ id: 1, username: 'admin', is_admin: true })
    const reader = fakeUser({ id: 2, username: 'reader', is_admin: false })
    renderScreen(admin, [admin, reader])
    await screen.findByText('admin')

    const adminRow = screen.getByText('admin').closest('li')
    const readerRow = screen.getByText('reader').closest('li')
    expect(adminRow).not.toBeNull()
    expect(readerRow).not.toBeNull()
    if (adminRow) expect(within(adminRow).getByText('Admin')).toBeInTheDocument()
    if (readerRow) expect(within(readerRow).queryByText('Admin')).not.toBeInTheDocument()
  })

  it("shows no trash button on the caller's own row, and one on everybody else's", async () => {
    const admin = fakeUser({ id: 1, username: 'admin', is_admin: true })
    const reader = fakeUser({ id: 2, username: 'reader' })
    renderScreen(admin, [admin, reader])
    await screen.findByText('admin')

    expect(screen.queryByRole('button', { name: 'Delete admin' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete reader' })).toBeInTheDocument()
  })

  it('creates an account through the dashed Add User row, then collapses it', async () => {
    const user = userEvent.setup()
    const admin = fakeUser({ id: 1, username: 'admin', is_admin: true })
    const api = renderScreen(admin, [admin])
    await screen.findByText('admin')

    await user.click(screen.getByRole('button', { name: '+ Add User' }))
    await user.type(screen.getByLabelText('Username'), 'newreader')
    await user.type(screen.getByLabelText('Password'), 'correct-horse')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => expect(screen.getByText('newreader')).toBeInTheDocument())
    expect(api.users.some((u) => u.username === 'newreader')).toBe(true)
    expect(screen.getByRole('button', { name: '+ Add User' })).toBeInTheDocument()
  })

  it('edits Kindle address and admin status, writing PATCH', async () => {
    const user = userEvent.setup()
    const admin = fakeUser({ id: 1, username: 'admin', is_admin: true })
    const reader = fakeUser({ id: 2, username: 'reader', is_admin: false, kindle_email: null })
    const api = renderScreen(admin, [admin, reader])
    await screen.findByText('reader')

    await user.click(screen.getByRole('button', { name: 'Edit reader' }))
    await user.type(screen.getByLabelText('Kindle address'), 'reader@kindle.com')
    await user.click(screen.getByLabelText('Administrator'))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      const updated = api.users.find((u) => u.username === 'reader')
      expect(updated?.kindle_email).toBe('reader@kindle.com')
      expect(updated?.is_admin).toBe(true)
    })
  })

  it('leaves the password unchanged when the new-password box is left blank', async () => {
    const user = userEvent.setup()
    const admin = fakeUser({ id: 1, username: 'admin', is_admin: true })
    const reader = fakeUser({ id: 2, username: 'reader', password: 'original' })
    const api = renderScreen(admin, [admin, reader])
    await screen.findByText('reader')

    await user.click(screen.getByRole('button', { name: 'Edit reader' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByLabelText('Set new password')).not.toBeInTheDocument())
    expect(api.users.find((u) => u.username === 'reader')?.password).toBe('original')
  })

  it('sets a new password when the box is filled in', async () => {
    const user = userEvent.setup()
    const admin = fakeUser({ id: 1, username: 'admin', is_admin: true })
    const reader = fakeUser({ id: 2, username: 'reader', password: 'original' })
    const api = renderScreen(admin, [admin, reader])
    await screen.findByText('reader')

    await user.click(screen.getByRole('button', { name: 'Edit reader' }))
    await user.type(screen.getByLabelText('Set new password'), 'brand-new')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(api.users.find((u) => u.username === 'reader')?.password).toBe('brand-new')
    )
  })

  it("disables the Administrator checkbox on the caller's own row", async () => {
    const user = userEvent.setup()
    const admin = fakeUser({ id: 1, username: 'admin', is_admin: true })
    renderScreen(admin, [admin])
    await screen.findByText('admin')

    await user.click(screen.getByRole('button', { name: 'Edit admin' }))

    expect(screen.getByLabelText('Administrator')).toBeDisabled()
  })

  it('deletes another account after confirming, and keeps the caller', async () => {
    const user = userEvent.setup()
    const admin = fakeUser({ id: 1, username: 'admin', is_admin: true })
    const reader = fakeUser({ id: 2, username: 'reader' })
    const api = renderScreen(admin, [admin, reader])
    await screen.findByText('reader')

    await user.click(screen.getByRole('button', { name: 'Delete reader' }))
    expect(
      screen.getByText(/Their shelves, personal tags, reading progress, notes, and sessions/)
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(screen.queryByText('reader')).not.toBeInTheDocument())
    expect(api.users.map((u) => u.username)).toEqual(['admin'])
  })

  it("shows the server's refusal when creating a taken username", async () => {
    const user = userEvent.setup()
    const admin = fakeUser({ id: 1, username: 'admin', is_admin: true })
    renderScreen(admin, [admin])
    await screen.findByText('admin')

    await user.click(screen.getByRole('button', { name: '+ Add User' }))
    await user.type(screen.getByLabelText('Username'), 'admin')
    await user.type(screen.getByLabelText('Password'), 'x')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(await screen.findByText('Username already taken')).toBeInTheDocument()
  })
})
