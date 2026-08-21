import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { AppRoutes } from './App'
import { createQueryClient } from './queryClient'
import { routes } from './routes'

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('routing', () => {
  it('sends / to the library, so the library has one address', () => {
    renderAt('/')

    expect(screen.getByRole('heading', { name: 'Library' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Library' })).toHaveAttribute('aria-current', 'page')
  })

  it.each([
    [routes.library, 'Library'],
    [routes.shelves, 'Shelves'],
    [routes.chat, 'Librarian'],
  ])('renders %s inside the shell', (path, heading) => {
    renderAt(path)

    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
    // Every screen keeps the frame: the nav is still there to navigate with.
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
  })

  it('shows the not-found screen for an address that means nothing', () => {
    renderAt('/no-such-page')

    expect(screen.getByRole('heading', { name: 'Not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to the library' })).toBeInTheDocument()
  })

  it('keeps the shell around the not-found screen', () => {
    // A reader who followed a stale link should be one click from somewhere
    // real, not stranded on a bare page.
    renderAt('/no-such-page')

    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
  })

  it('gives every screen a main landmark to skip the navigation with', () => {
    renderAt(routes.library)

    expect(screen.getByRole('main')).toBeInTheDocument()
  })
})

describe('query client', () => {
  it('does not retry, so the error block is the only thing reporting failure', () => {
    // The Flutter client had to turn this off in Riverpod for the same reason:
    // an invisible retry racing the visible "Try again" button makes the error
    // blink in and out, and the reader cannot tell whether their click did
    // anything. TanStack Query retries three times unless told otherwise.
    const defaults = createQueryClient().getDefaultOptions()

    expect(defaults.queries?.retry).toBe(false)
    expect(defaults.mutations?.retry).toBe(false)
  })

  it('hands out a fresh cache each time, so one test cannot leak into the next', () => {
    expect(createQueryClient()).not.toBe(createQueryClient())
  })
})
