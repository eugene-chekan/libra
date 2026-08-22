import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { ApiProvider } from '../api/ApiProvider'
import { fakeUser, FakeLibraApi } from '../api/FakeLibraApi'
import { routes } from '../routes'
import { RequireSession } from '../session/RequireSession'
import { SessionProvider } from '../session/SessionProvider'
import { LoginScreen } from './LoginScreen'

function renderApp(api: FakeLibraApi, initialPath: string) {
  return render(
    <ApiProvider api={api}>
      <SessionProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path={routes.login} element={<LoginScreen />} />
            <Route element={<RequireSession />}>
              <Route path={routes.library} element={<h1>Library</h1>} />
              <Route path={routes.shelves} element={<h1>Shelves</h1>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </ApiProvider>
  )
}

describe('LoginScreen', () => {
  it('has no dead affordances', () => {
    // Self-registration and password reset are explicit non-goals — offering
    // a link to either is worse than offering neither.
    renderApp(new FakeLibraApi(), routes.login)

    expect(screen.queryByText(/remember me/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/forgot password/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/create account/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reveal|show password/i })).not.toBeInTheDocument()
  })

  it('disables submit until both fields are filled', async () => {
    const user = userEvent.setup()
    renderApp(new FakeLibraApi(), routes.login)

    const submit = screen.getByRole('button', { name: /sign in/i })
    expect(submit).toBeDisabled()

    await user.type(screen.getByLabelText(/username/i), 'eugene')
    expect(submit).toBeDisabled()

    await user.type(screen.getByLabelText(/^password/i), 'correct-horse')
    expect(submit).toBeEnabled()
  })

  it('signs in and lands on the library by default', async () => {
    const user = userEvent.setup()
    const fakeAccount = fakeUser({ username: 'eugene', password: 'correct-horse' })
    renderApp(new FakeLibraApi({ users: [fakeAccount] }), routes.login)

    await user.type(screen.getByLabelText(/username/i), 'eugene')
    await user.type(screen.getByLabelText(/^password/i), 'correct-horse')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Library' })).toBeInTheDocument()
    )
  })

  it('routes to next on success rather than the library', async () => {
    const user = userEvent.setup()
    const fakeAccount = fakeUser({ username: 'eugene', password: 'correct-horse' })
    renderApp(
      new FakeLibraApi({ users: [fakeAccount] }),
      `${routes.login}?next=${encodeURIComponent(routes.shelves)}`
    )

    await user.type(screen.getByLabelText(/username/i), 'eugene')
    await user.type(screen.getByLabelText(/^password/i), 'correct-horse')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Shelves' })).toBeInTheDocument()
    )
  })

  it('submits on Enter from the password field', async () => {
    const user = userEvent.setup()
    const fakeAccount = fakeUser({ username: 'eugene', password: 'correct-horse' })
    renderApp(new FakeLibraApi({ users: [fakeAccount] }), routes.login)

    await user.type(screen.getByLabelText(/username/i), 'eugene')
    await user.type(screen.getByLabelText(/^password/i), 'correct-horse{Enter}')

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Library' })).toBeInTheDocument()
    )
  })

  it.each([
    ['a username nobody has', 'ghost', 'whatever'],
    ['the right username, wrong password', 'eugene', 'wrong'],
  ])(
    'shows the same fixed error for %s, never which one was wrong',
    async (_case, username, password) => {
      const user = userEvent.setup()
      const fakeAccount = fakeUser({ username: 'eugene', password: 'correct-horse' })
      renderApp(new FakeLibraApi({ users: [fakeAccount] }), routes.login)

      await user.type(screen.getByLabelText(/username/i), username)
      await user.type(screen.getByLabelText(/^password/i), password)
      await user.click(screen.getByRole('button', { name: /sign in/i }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect username or password.')
      // Still on the login screen — a failed login is not a navigation.
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
    }
  )

  it('does not show the expiry banner on an ordinary, first-ever visit', async () => {
    renderApp(new FakeLibraApi(), routes.login)

    await screen.findByRole('button', { name: /sign in/i })
    expect(screen.queryByText(/session expired/i)).not.toBeInTheDocument()
  })

  it('shows the expiry banner when a live session just ended, not inferred from next', async () => {
    const account = fakeUser({ username: 'eugene' })
    const api = new FakeLibraApi({ users: [account], signedInAs: account })
    renderApp(api, routes.library)

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Library' })).toBeInTheDocument()
    )
    api.signedInId = null
    await api.me().catch(() => {})

    await waitFor(() => expect(screen.getByText(/your session expired/i)).toBeInTheDocument())
  })
})
