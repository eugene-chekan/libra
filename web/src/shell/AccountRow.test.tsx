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

  it('saves a Kindle address, closes, and keeps the new one in the session', async () => {
    const user = userEvent.setup()
    // The fake mutates the same object it was handed, so this is the stored
    // record — no indexing into `api.users`, which is possibly-undefined.
    const { user: stored } = renderSignedIn({ kindle_email: null })

    await user.click(await screen.findByRole('button', { name: /eugene/i }))
    await user.click(await screen.findByRole('menuitem', { name: /kindle email/i }))
    await user.type(await screen.findByLabelText(/send-to-kindle address/i), 'reader@kindle.com')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(stored.kindle_email).toBe('reader@kindle.com')

    // Reopening reads the field back from the session, not from the server, so
    // this is what proves `setUser` ran. Without it the modal would offer an
    // empty box for an address that is already set, and the Send to Kindle
    // button on the book screen would still believe there is none.
    await user.click(screen.getByRole('button', { name: /eugene/i }))
    await user.click(await screen.findByRole('menuitem', { name: /kindle email/i }))
    expect(await screen.findByLabelText(/send-to-kindle address/i)).toHaveValue('reader@kindle.com')
  })

  it('clears the address when the box is emptied, rather than leaving it alone', async () => {
    // `PATCH /users/{id}` reads its body with `exclude_unset`, so an absent key
    // means "no change" and an explicit null means "clear it". The modal has to
    // send the second, or an address could never be removed.
    const user = userEvent.setup()
    const { user: stored } = renderSignedIn({ kindle_email: 'old@kindle.com' })

    await user.click(await screen.findByRole('button', { name: /eugene/i }))
    await user.click(await screen.findByRole('menuitem', { name: /kindle email/i }))
    await user.clear(await screen.findByLabelText(/send-to-kindle address/i))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(stored.kindle_email).toBeNull())
  })
})
