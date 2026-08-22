import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { ApiProvider } from '../api/ApiProvider'
import { fakeUser, FakeLibraApi } from '../api/FakeLibraApi'
import { routes } from '../routes'
import { RequireSession } from './RequireSession'
import { SessionProvider } from './SessionProvider'

function renderGuarded(api: FakeLibraApi, initialPath: string = routes.library) {
  return render(
    <ApiProvider api={api}>
      <SessionProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path={routes.login} element={<div>Login screen</div>} />
            <Route element={<RequireSession />}>
              <Route path={routes.library} element={<div>Library screen</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </ApiProvider>
  )
}

describe('RequireSession', () => {
  it('renders nothing during the cold-load window, not the login screen', () => {
    // A protected route redirecting to /login before the session is known
    // would flash the login card on every refresh for someone who is, in
    // fact, signed in.
    const api = new FakeLibraApi()
    renderGuarded(api)

    expect(screen.queryByText('Login screen')).not.toBeInTheDocument()
    expect(screen.queryByText('Library screen')).not.toBeInTheDocument()
  })

  it('renders the protected route once the session resolves signed-in', async () => {
    const user = fakeUser()
    const api = new FakeLibraApi({ users: [user], signedInAs: user })
    renderGuarded(api)

    await waitFor(() => expect(screen.getByText('Library screen')).toBeInTheDocument())
  })

  it('redirects to /login, carrying the attempted address as next, when signed out', async () => {
    const api = new FakeLibraApi()
    renderGuarded(api, `${routes.library}?tag=fiction`)

    await waitFor(() => expect(screen.getByText('Login screen')).toBeInTheDocument())
  })
})
