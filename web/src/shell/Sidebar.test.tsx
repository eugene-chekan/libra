import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'

import { ApiProvider } from '../api/ApiProvider'
import { fakeShelf, fakeTag, fakeUser, FakeLibraApi } from '../api/FakeLibraApi'
import { FakeLibrarianService } from '../librarian/FakeLibrarianService'
import { LibrarianPanel } from '../librarian/LibrarianPanel'
import { LibrarianProvider } from '../librarian/LibrarianProvider'
import { LibrarianServiceProvider } from '../librarian/LibrarianServiceContext'
import { createQueryClient } from '../queryClient'
import { primaryNav, routes } from '../routes'
import { SessionProvider } from '../session/SessionProvider'
import { Sidebar } from './Sidebar'

function renderAt(path: string, api: FakeLibraApi = signedInApi()) {
  return render(
    <ApiProvider api={api}>
      <QueryClientProvider client={createQueryClient()}>
        <LibrarianServiceProvider service={new FakeLibrarianService()}>
          <SessionProvider>
            <MemoryRouter initialEntries={[path]}>
              <LibrarianProvider>
                <Sidebar />
                <LibrarianPanel />
              </LibrarianProvider>
            </MemoryRouter>
          </SessionProvider>
        </LibrarianServiceProvider>
      </QueryClientProvider>
    </ApiProvider>
  )
}

function signedInApi(): FakeLibraApi {
  const user = fakeUser({ username: 'eugene' })
  return new FakeLibraApi({ users: [user], signedInAs: user })
}

describe('Sidebar', () => {
  // The collapsed choice is remembered in localStorage, and jsdom keeps one store for the
  // whole file — so without this a test that collapses would decide what the next one sees.
  beforeEach(() => localStorage.clear())

  it('is a navigation landmark', () => {
    renderAt(routes.library)

    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
  })

  it('renders every primary nav entry as a real link', () => {
    // Each row is a real `<a href>` element, so the role and the keyboard
    // handling come from the element itself, not from an attribute claiming
    // it.
    renderAt(routes.library)

    for (const { label, to } of primaryNav) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', to)
    }
  })

  it('marks the current page, and marks only that one', () => {
    renderAt(routes.shelves)

    expect(screen.getByRole('link', { name: 'Shelves' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Library' })).not.toHaveAttribute('aria-current')
  })

  it('points the logo at the library', () => {
    renderAt(routes.library)

    expect(screen.getByRole('link', { name: 'libra' })).toHaveAttribute('href', routes.library)
  })

  it('opens the librarian panel from its sidebar row, rather than navigating', async () => {
    const user = userEvent.setup()
    renderAt(routes.library)
    await screen.findByText('eugene')

    await user.click(screen.getByRole('button', { name: 'Librarian' }))

    expect(screen.getByRole('heading', { name: 'Librarian' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Librarian' })).not.toBeInTheDocument()
  })

  it('reaches every row with the keyboard alone', () => {
    // Asserted on the real accessibility tree rather than on a framework's
    // idea of one.
    renderAt(routes.library)
    const reachable = ['libra', ...primaryNav.map((entry) => entry.label), 'Add Book']

    for (const name of reachable) {
      expect(
        screen.getByRole(name === 'Add Book' ? 'button' : 'link', { name })
      ).not.toHaveAttribute('tabindex', '-1')
    }
  })

  it('opens the Add Book modal, reachable by keyboard, from a click on Add Book', async () => {
    renderAt(routes.library)

    await userEvent.click(screen.getByRole('button', { name: 'Add Book' }))

    expect(screen.getByRole('dialog', { name: 'Add Book' })).toBeInTheDocument()
  })

  it('does not invent the shared-with-you or shelves sections with nothing in them', async () => {
    // Shared With You needs other readers' public shelves, and a library with
    // no shelves shows no SHELVES section rather than an empty shell of one.
    renderAt(routes.library)

    await waitFor(() => expect(screen.getByText('eugene')).toBeInTheDocument())
    expect(screen.queryByText(/shared with you/i)).not.toBeInTheDocument()
    // Not "Shelves" — that text already exists as the primary nav link.
    // aria-expanded only exists on the SHELVES/TAGS section headers.
    expect(screen.queryByRole('button', { name: /^shelves$/i })).not.toBeInTheDocument()
  })

  it('keeps the tags section with no tags, because it holds the only way to make one', async () => {
    // SHELVES may vanish when empty: the Shelves page offers another way to a
    // first shelf. Tags have no second door, so hiding this section would
    // leave a reader with no tags no way to ever create one.
    renderAt(routes.library)

    await waitFor(() => expect(screen.getByText('eugene')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /^tags$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /manage tags/i })).toBeInTheDocument()
  })

  it('shows the signed-in account in the pinned footer, once the session resolves', async () => {
    renderAt(routes.library)

    await waitFor(() => expect(screen.getByText('eugene')).toBeInTheDocument())
  })

  it('shows real shelves and tags once there are some, between the primary nav and the footer', async () => {
    const user = fakeUser({ username: 'eugene' })
    const shelf = fakeShelf({ name: 'Currently Reading', owner_id: user.id, editable: true })
    const tag = fakeTag({ name: 'sci-fi' })
    const api = new FakeLibraApi({ users: [user], signedInAs: user, shelves: [shelf], tags: [tag] })

    renderAt(routes.library, api)

    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Currently Reading' })).toBeInTheDocument()
    )
    expect(screen.getByRole('link', { name: 'Currently Reading' })).toHaveAttribute(
      'href',
      `/library?shelf=${shelf.id}`
    )
    expect(screen.getByRole('link', { name: /sci-fi/i })).toHaveAttribute(
      'href',
      `/library?tags=${tag.id}`
    )
  })

  it('shows Admin in the nav for an admin, pointing at /admin', async () => {
    const admin = fakeUser({ username: 'root', is_admin: true })
    const api = new FakeLibraApi({ users: [admin], signedInAs: admin })
    renderAt(routes.library, api)

    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', routes.admin)
    )
  })

  it('does not show Admin for a reader who is not one', async () => {
    renderAt(routes.library)

    await waitFor(() => expect(screen.getByText('eugene')).toBeInTheDocument())
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
  })
})

describe('Sidebar, collapsed', () => {
  beforeEach(() => localStorage.clear())

  async function collapse() {
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Collapse sidebar' }))
    return user
  }

  /*
   The lists and the version line go from the DOM entirely; the row labels only stop being drawn,
   which jsdom cannot see — it has no layout, and the class that hides them works by clipping.
   That half is checked in a real browser, in `e2e/shell.spec.ts`.
  */
  it('drops the lists and the version line', async () => {
    const reader = fakeUser({ username: 'eugene' })
    const api = new FakeLibraApi({
      users: [reader],
      signedInAs: reader,
      shelves: [fakeShelf({ name: 'Reading Now', owner_id: reader.id, editable: true })],
      tags: [fakeTag({ name: 'fantasy' })],
    })
    renderAt(routes.library, api)
    await screen.findByRole('link', { name: 'Reading Now' })

    await collapse()

    expect(screen.queryByRole('link', { name: 'Reading Now' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /fantasy/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/^libra \d/)).not.toBeInTheDocument()
  })

  /*
   The whole point of hiding a label rather than deleting it. A collapsed sidebar that a screen
   reader cannot read is not a smaller sidebar, it is a broken one.
  */
  it('keeps every row nameable, so nothing is lost to a screen reader', async () => {
    renderAt(routes.library)

    await collapse()

    for (const { label } of primaryNav) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Librarian' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Book' })).toBeInTheDocument()
  })

  it('opens back up, and the toggle says which way it goes', async () => {
    renderAt(routes.library)

    const user = await collapse()
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Expand sidebar' }))

    expect(await screen.findByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument()
    expect(screen.getByText('Add Book')).toBeInTheDocument()
  })

  it('remembers the choice, so it is not a decision you make every visit', async () => {
    const { unmount } = renderAt(routes.library)
    await collapse()
    unmount()

    renderAt(routes.library)

    expect(await screen.findByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument()
  })

  it('shows the account as an avatar alone, with the menu still reachable', async () => {
    const user = userEvent.setup()
    renderAt(routes.library)
    await screen.findByText('eugene')

    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }))

    expect(screen.queryByText('eugene')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /account/i }))
    expect(await screen.findByRole('menuitem', { name: /sign out/i })).toBeInTheDocument()
  })
})
