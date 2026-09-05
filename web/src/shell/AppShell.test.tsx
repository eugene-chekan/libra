import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { ApiProvider } from '../api/ApiProvider'
import { fakeUser, FakeLibraApi } from '../api/FakeLibraApi'
import { FakeLibrarianService } from '../librarian/FakeLibrarianService'
import { LibrarianProvider } from '../librarian/LibrarianProvider'
import { LibrarianServiceProvider } from '../librarian/LibrarianServiceContext'
import { createQueryClient } from '../queryClient'
import { routes } from '../routes'
import { SessionProvider } from '../session/SessionProvider'
import { setViewportWidth } from '../test/viewport'
import { AppShell } from './AppShell'

const PHONE = 390
const DESKTOP = 1280

function renderShell() {
  const user = fakeUser({ username: 'eugene' })
  const api = new FakeLibraApi({ users: [user], signedInAs: user })
  render(
    <ApiProvider api={api}>
      <QueryClientProvider client={createQueryClient()}>
        <LibrarianServiceProvider service={new FakeLibrarianService()}>
          <SessionProvider>
            <MemoryRouter initialEntries={[routes.library]}>
              <LibrarianProvider>
                <Routes>
                  <Route element={<AppShell />}>
                    <Route path={routes.library} element={<p>the library</p>} />
                    <Route path={routes.shelves} element={<p>the shelves</p>} />
                  </Route>
                </Routes>
              </LibrarianProvider>
            </MemoryRouter>
          </SessionProvider>
        </LibrarianServiceProvider>
      </QueryClientProvider>
    </ApiProvider>
  )
}

describe('AppShell on a desktop', () => {
  it('puts the sidebar beside the page, with nothing to open', async () => {
    setViewportWidth(DESKTOP)

    renderShell()

    expect(await screen.findByText('the library')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Menu' })).not.toBeInTheDocument()
  })
})

describe('AppShell on a phone', () => {
  it('hides the sidebar behind a menu button', async () => {
    setViewportWidth(PHONE)

    renderShell()

    expect(await screen.findByText('the library')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Menu' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
  })

  it('opens the same sidebar in a drawer', async () => {
    setViewportWidth(PHONE)
    const user = userEvent.setup()
    renderShell()

    await user.click(await screen.findByRole('button', { name: 'Menu' }))

    // The whole sidebar, not a phone-sized copy of part of it.
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Shelves' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Book' })).toBeInTheDocument()
  })

  /*
   The drawer covers the page, so leaving it open over the page you just asked for would make
   every choice cost two taps.
  */
  it('closes itself when you choose somewhere to go', async () => {
    setViewportWidth(PHONE)
    const user = userEvent.setup()
    renderShell()

    await user.click(await screen.findByRole('button', { name: 'Menu' }))
    await user.click(await screen.findByRole('link', { name: 'Shelves' }))

    expect(await screen.findByText('the shelves')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
    )
  })
})
