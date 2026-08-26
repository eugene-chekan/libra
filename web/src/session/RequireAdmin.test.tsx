import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { ApiProvider } from '../api/ApiProvider'
import { fakeUser, FakeLibraApi } from '../api/FakeLibraApi'
import { routes } from '../routes'
import { RequireAdmin } from './RequireAdmin'
import { SessionProvider } from './SessionProvider'

function renderGuarded(api: FakeLibraApi) {
  return render(
    <ApiProvider api={api}>
      <SessionProvider>
        <MemoryRouter initialEntries={[routes.admin]}>
          <Routes>
            <Route path={routes.library} element={<div>Library screen</div>} />
            <Route element={<RequireAdmin />}>
              <Route path={routes.admin} element={<div>Admin screen</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </ApiProvider>
  )
}

describe('RequireAdmin', () => {
  it('renders nothing during the cold-load window', () => {
    const api = new FakeLibraApi()
    renderGuarded(api)

    expect(screen.queryByText('Admin screen')).not.toBeInTheDocument()
    expect(screen.queryByText('Library screen')).not.toBeInTheDocument()
  })

  it('renders the protected route for an admin', async () => {
    const admin = fakeUser({ is_admin: true })
    const api = new FakeLibraApi({ users: [admin], signedInAs: admin })
    renderGuarded(api)

    await waitFor(() => expect(screen.getByText('Admin screen')).toBeInTheDocument())
  })

  it('redirects a signed-in reader who is not an admin to the library', async () => {
    const reader = fakeUser({ is_admin: false })
    const api = new FakeLibraApi({ users: [reader], signedInAs: reader })
    renderGuarded(api)

    await waitFor(() => expect(screen.getByText('Library screen')).toBeInTheDocument())
  })
})
