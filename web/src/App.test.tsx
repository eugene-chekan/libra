import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { fakeBook, fakeUser, FakeLibraApi } from './api/FakeLibraApi'
import { ApiProvider } from './api/ApiProvider'
import { AppRoutes } from './App'
import { FakeLibrarianService } from './librarian/FakeLibrarianService'
import { LibrarianPanel } from './librarian/LibrarianPanel'
import { LibrarianProvider } from './librarian/LibrarianProvider'
import { LibrarianServiceProvider } from './librarian/LibrarianServiceContext'
import type { BookReader } from './reader/BookReader'
import { BookReaderProvider } from './reader/BookReaderContext'
import { FakeBookReader } from './reader/FakeBookReader'
import { createQueryClient } from './queryClient'
import { bookPath, readerPath, routes } from './routes'
import { SessionProvider } from './session/SessionProvider'

/**
 * Signed in by default, because `AppRoutes` guards everything but `/login`
 * and these tests are about the route table, not about auth — that has its
 * own suite in `session/`. `RequireSession.test.tsx` and `LoginScreen.test.tsx`
 * cover the signed-out and cold-load cases this helper skips past.
 */
function renderAt(
  path: string,
  api: FakeLibraApi = signedInApi(),
  reader: BookReader = new FakeBookReader()
) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ApiProvider api={api}>
        <LibrarianServiceProvider service={new FakeLibrarianService()}>
          <MemoryRouter initialEntries={[path]}>
            <SessionProvider>
              <LibrarianProvider>
                <BookReaderProvider reader={reader}>
                  <AppRoutes />
                </BookReaderProvider>
                <LibrarianPanel />
              </LibrarianProvider>
            </SessionProvider>
          </MemoryRouter>
        </LibrarianServiceProvider>
      </ApiProvider>
    </QueryClientProvider>
  )
}

function signedInApi(): FakeLibraApi {
  const user = fakeUser()
  return new FakeLibraApi({ users: [user], signedInAs: user })
}

describe('routing', () => {
  it('sends / to the library, so the library has one address', async () => {
    renderAt('/')

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Library' })).toBeInTheDocument()
    )
    expect(screen.getByRole('link', { name: 'Library' })).toHaveAttribute('aria-current', 'page')
  })

  it.each([
    [routes.library, 'Library'],
    [routes.shelves, 'Shelves'],
  ])('renders %s inside the shell', async (path, heading) => {
    renderAt(path)

    await waitFor(() => expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument())
    // Every screen keeps the frame: the nav is still there to navigate with.
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
  })

  it('the librarian panel opens over the current page and stays open on navigation', async () => {
    const user = userEvent.setup()
    renderAt(routes.library)
    await screen.findByRole('heading', { name: 'Library' })

    await user.click(screen.getByRole('button', { name: 'Librarian' }))
    expect(screen.getByRole('heading', { name: 'Librarian' })).toBeInTheDocument()

    // The panel is a modal overlay: it marks the page underneath
    // `aria-hidden` and blocks pointer events on it, so a real reader cannot
    // click through to the sidebar while it's open. `fireEvent` reaches the
    // link directly, standing in for whatever non-click route change a real
    // reader would use instead (the browser's back button, for one) — the
    // point under test is only whether the panel survives the route
    // changing underneath it, not how that change gets triggered.
    fireEvent.click(screen.getByRole('link', { name: 'Shelves', hidden: true }))
    await screen.findByRole('heading', { name: 'Shelves', hidden: true })

    expect(screen.getByRole('heading', { name: 'Librarian' })).toBeInTheDocument()
  })

  it('renders one book inside the shell too', async () => {
    const user = fakeUser()
    const api = new FakeLibraApi({
      users: [user],
      signedInAs: user,
      books: [fakeBook({ id: 4, title: 'Dune' })],
    })

    renderAt(bookPath(4), api)

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Dune', level: 1 })).toBeInTheDocument()
    )
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
  })

  it('renders /admin/users inside the shell for an admin, with the Users tab current', async () => {
    const admin = fakeUser({ is_admin: true })
    const api = new FakeLibraApi({ users: [admin], signedInAs: admin })
    renderAt(routes.adminUsers, api)

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Admin' })).toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('aria-current', 'page')
  })

  it('sends /admin to /admin/users', async () => {
    const admin = fakeUser({ is_admin: true })
    const api = new FakeLibraApi({ users: [admin], signedInAs: admin })
    renderAt(routes.admin, api)

    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('aria-current', 'page')
    )
  })

  it('sends a non-admin at /admin to the library, not the admin page', async () => {
    renderAt(routes.admin)

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Library' })).toBeInTheDocument()
    )
  })

  it('renders the reader outside the shell, so nothing competes with the prose', async () => {
    const user = fakeUser()
    const api = new FakeLibraApi({
      users: [user],
      signedInAs: user,
      books: [fakeBook({ id: 4, title: 'Dune' })],
    })

    renderAt(readerPath(4), api, new FakeBookReader({ title: 'Dune' }))

    await waitFor(() => expect(screen.getByRole('region', { name: 'Dune' })).toBeInTheDocument())
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
  })

  it('shows the not-found screen for an address that means nothing', async () => {
    renderAt('/no-such-page')

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Not found' })).toBeInTheDocument()
    )
    expect(screen.getByRole('link', { name: 'Back to the library' })).toBeInTheDocument()
  })

  it('keeps the shell around the not-found screen', async () => {
    // A reader who followed a stale link should be one click from somewhere
    // real, not stranded on a bare page.
    renderAt('/no-such-page')

    await waitFor(() =>
      expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    )
  })

  it('gives every screen a main landmark to skip the navigation with', async () => {
    renderAt(routes.library)

    await waitFor(() => expect(screen.getByRole('main')).toBeInTheDocument())
  })
})

describe('query client', () => {
  it('does not retry, so the error block is the only thing reporting failure', () => {
    // An invisible retry racing the visible "Try again" button makes the
    // error blink in and out, and the reader cannot tell whether their click
    // did anything. TanStack Query retries three times unless told otherwise.
    const defaults = createQueryClient().getDefaultOptions()

    expect(defaults.queries?.retry).toBe(false)
    expect(defaults.mutations?.retry).toBe(false)
  })

  it('hands out a fresh cache each time, so one test cannot leak into the next', () => {
    expect(createQueryClient()).not.toBe(createQueryClient())
  })
})
