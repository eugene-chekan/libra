import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { fakeBook, fakeUser, FakeLibraApi } from './api/FakeLibraApi'
import { ApiProvider } from './api/ApiProvider'
import { AppRoutes } from './App'
import { createQueryClient } from './queryClient'
import { bookPath, readerPath, routes } from './routes'
import { SessionProvider } from './session/SessionProvider'

/**
 * Signed in by default, because `AppRoutes` guards everything but `/login`
 * and these tests are about the route table, not about auth — that has its
 * own suite in `session/`. `RequireSession.test.tsx` and `LoginScreen.test.tsx`
 * cover the signed-out and cold-load cases this helper skips past.
 */
function renderAt(path: string, api: FakeLibraApi = signedInApi()) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ApiProvider api={api}>
        <MemoryRouter initialEntries={[path]}>
          <SessionProvider>
            <AppRoutes />
          </SessionProvider>
        </MemoryRouter>
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
    [routes.chat, 'Librarian'],
  ])('renders %s inside the shell', async (path, heading) => {
    renderAt(path)

    await waitFor(() => expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument())
    // Every screen keeps the frame: the nav is still there to navigate with.
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
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

  it('routes the reader, so the Start Reading button does not lead to a dead address', async () => {
    // It is a stand-in until #36 builds it.
    renderAt(readerPath(4))

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Reader' })).toBeInTheDocument())
    expect(screen.getByText(/arrives with the reader milestone \(#36\)/)).toBeInTheDocument()
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
