import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { ApiProvider } from '../api/ApiProvider'
import { fakeShelf, fakeTag, fakeUser, FakeLibraApi } from '../api/FakeLibraApi'
import { createQueryClient } from '../queryClient'
import { primaryNav, routes } from '../routes'
import { SessionProvider } from '../session/SessionProvider'
import { Sidebar } from './Sidebar'

function renderAt(path: string, api: FakeLibraApi = signedInApi()) {
  return render(
    <ApiProvider api={api}>
      <QueryClientProvider client={createQueryClient()}>
        <SessionProvider>
          <MemoryRouter initialEntries={[path]}>
            <Sidebar />
          </MemoryRouter>
        </SessionProvider>
      </QueryClientProvider>
    </ApiProvider>
  )
}

function signedInApi(): FakeLibraApi {
  const user = fakeUser({ username: 'eugene' })
  return new FakeLibraApi({ users: [user], signedInAs: user })
}

describe('Sidebar', () => {
  it('is a navigation landmark', () => {
    renderAt(routes.library)

    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
  })

  it('renders every primary nav entry as a real link', () => {
    // The rewrite exists because of this. In the Flutter client every one of
    // these rows was wrapped in `Semantics(button: true)` and none of them
    // reached the page — nine nodes existed in the framework and a screen
    // reader found nothing (#50). Here they are `<a href>` elements, so the
    // role and the keyboard come from the element itself.
    renderAt(routes.library)

    for (const { label, to } of primaryNav) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', to)
    }
  })

  it('marks the current page, and marks only that one', () => {
    renderAt(routes.shelves)

    expect(screen.getByRole('link', { name: 'Shelves' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Library' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: 'Librarian' })).not.toHaveAttribute('aria-current')
  })

  it('points the logo at the library', () => {
    renderAt(routes.chat)

    expect(screen.getByRole('link', { name: 'libra' })).toHaveAttribute('href', routes.library)
  })

  it('reaches every row with the keyboard alone', () => {
    // The claim `tappable_row.dart` made and could not keep. Asserted here on
    // the real accessibility tree rather than on a framework's idea of one.
    renderAt(routes.library)
    const reachable = ['libra', ...primaryNav.map((entry) => entry.label), 'Add Book']

    for (const name of reachable) {
      expect(
        screen.getByRole(name === 'Add Book' ? 'button' : 'link', { name })
      ).not.toHaveAttribute('tabindex', '-1')
    }
  })

  it('keeps Add Book focusable while it is unavailable, and says why', async () => {
    // `aria-disabled` rather than `disabled`: a disabled attribute is skipped
    // by the keyboard entirely and explains nothing to a screen-reader user.
    renderAt(routes.library)
    const addBook = screen.getByRole('button', { name: 'Add Book' })

    expect(addBook).toHaveAttribute('aria-disabled', 'true')
    expect(addBook).toHaveAccessibleDescription('Adding books arrives with the upload screen')

    await userEvent.tab()
    await userEvent.tab()
    expect(document.activeElement).not.toBe(document.body)
  })

  it('does not invent the shared-with-you section, or show shelves/tags sections with nothing in them', async () => {
    // Shared With You needs other readers' public shelves — #28, not this
    // milestone. Shelves and Tags are real now, but a library with none of
    // either still shows neither section rather than an empty shell of one.
    renderAt(routes.library)

    await waitFor(() => expect(screen.getByText('eugene')).toBeInTheDocument())
    expect(screen.queryByText(/shared with you/i)).not.toBeInTheDocument()
    // Not "Shelves" — that text already exists as the primary nav link.
    // aria-expanded only exists on the SHELVES/TAGS section headers.
    expect(screen.queryByRole('button', { name: /^shelves$/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/^tags$/i)).not.toBeInTheDocument()
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
})
