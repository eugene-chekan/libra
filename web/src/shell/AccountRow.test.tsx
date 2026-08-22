import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ApiProvider } from '../api/ApiProvider'
import { fakeUser, FakeLibraApi } from '../api/FakeLibraApi'
import { SessionProvider } from '../session/SessionProvider'
import { AccountRow } from './AccountRow'

function renderSignedIn(overrides: Parameters<typeof fakeUser>[0] = {}) {
  const user = fakeUser({ username: 'eugene', ...overrides })
  const api = new FakeLibraApi({ users: [user], signedInAs: user })
  const view = render(
    <ApiProvider api={api}>
      <SessionProvider>
        <AccountRow />
      </SessionProvider>
    </ApiProvider>
  )
  return { api, user, ...view }
}

describe('AccountRow', () => {
  it('renders nothing before the session resolves, and nothing when signed out', () => {
    const api = new FakeLibraApi()
    render(
      <ApiProvider api={api}>
        <SessionProvider>
          <AccountRow />
        </SessionProvider>
      </ApiProvider>
    )

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows the username and its uppercased first letter as the avatar', async () => {
    renderSignedIn({ username: 'eugene' })

    expect(await screen.findByText('eugene')).toBeInTheDocument()
    expect(screen.getByText('E')).toBeInTheDocument()
  })

  it('shows an Admin line only for an admin', async () => {
    renderSignedIn({ is_admin: false })

    await screen.findByText('eugene')
    expect(screen.queryByText('Admin')).not.toBeInTheDocument()
  })

  it('shows Admin for an admin account', async () => {
    renderSignedIn({ is_admin: true })

    expect(await screen.findByText('Admin')).toBeInTheDocument()
  })

  it('opens a dropdown with Kindle Email and Sign Out, and nothing for Manage Users', async () => {
    // Manage Users is #31, deliberately out of scope here — the row must not
    // link to a screen that does not exist yet.
    const user = userEvent.setup()
    renderSignedIn({ is_admin: true })

    await user.click(await screen.findByRole('button', { name: /eugene/i }))

    expect(await screen.findByRole('menuitem', { name: /kindle email/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /manage users/i })).not.toBeInTheDocument()
  })

  it('closes the dropdown on Escape', async () => {
    const user = userEvent.setup()
    renderSignedIn()

    await user.click(await screen.findByRole('button', { name: /eugene/i }))
    expect(await screen.findByRole('menuitem', { name: /sign out/i })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('menuitem', { name: /sign out/i })).not.toBeInTheDocument()
    )
  })

  it('signs out through the API when Sign Out is selected', async () => {
    const user = userEvent.setup()
    const { api } = renderSignedIn()

    await user.click(await screen.findByRole('button', { name: /eugene/i }))
    await user.click(await screen.findByRole('menuitem', { name: /sign out/i }))

    await waitFor(() => expect(api.calls).toContain('logout'))
  })

  it('opens the Kindle Email modal from the dropdown', async () => {
    const user = userEvent.setup()
    renderSignedIn()

    await user.click(await screen.findByRole('button', { name: /eugene/i }))
    await user.click(await screen.findByRole('menuitem', { name: /kindle email/i }))

    expect(await screen.findByRole('dialog', { name: /kindle email/i })).toBeInTheDocument()
  })
})
