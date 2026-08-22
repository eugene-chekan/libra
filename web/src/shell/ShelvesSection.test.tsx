import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { ApiProvider } from '../api/ApiProvider'
import { fakeShelf, fakeUser, FakeLibraApi } from '../api/FakeLibraApi'
import { createQueryClient } from '../queryClient'
import { ShelvesSection } from './ShelvesSection'

function renderAt(path: string, api: FakeLibraApi) {
  return render(
    <ApiProvider api={api}>
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="*" element={<ShelvesSection />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </ApiProvider>
  )
}

describe('ShelvesSection', () => {
  it("lists only the caller's own shelves, not other readers' shared ones", async () => {
    const user = fakeUser()
    const other = fakeUser({ username: 'other' })
    const api = new FakeLibraApi({
      users: [user, other],
      signedInAs: user,
      shelves: [
        fakeShelf({ name: 'To Read', owner_id: user.id, editable: true }),
        fakeShelf({
          name: "Someone else's",
          owner_id: other.id,
          visibility: 'public',
          editable: false,
        }),
      ],
    })

    renderAt('/library', api)

    await waitFor(() => expect(screen.getByText('To Read')).toBeInTheDocument())
    expect(screen.queryByText("Someone else's")).not.toBeInTheDocument()
  })

  it('marks the shelf named in the URL as the active one', async () => {
    const user = fakeUser()
    const shelf = fakeShelf({ name: 'To Read', owner_id: user.id, editable: true })
    const api = new FakeLibraApi({ users: [user], signedInAs: user, shelves: [shelf] })

    renderAt(`/library?shelf=${shelf.id}`, api)

    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'To Read' })).toHaveAttribute('aria-current', 'true')
    )
  })

  it('links to the library filtered by that shelf', async () => {
    const user = fakeUser()
    const shelf = fakeShelf({ name: 'To Read', owner_id: user.id, editable: true })
    const api = new FakeLibraApi({ users: [user], signedInAs: user, shelves: [shelf] })

    renderAt('/library', api)

    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'To Read' })).toHaveAttribute(
        'href',
        `/library?shelf=${shelf.id}`
      )
    )
  })

  it('links back to a bare /library when clicking the already-active shelf', async () => {
    const user = fakeUser()
    const shelf = fakeShelf({ name: 'To Read', owner_id: user.id, editable: true })
    const api = new FakeLibraApi({ users: [user], signedInAs: user, shelves: [shelf] })

    renderAt(`/library?shelf=${shelf.id}&q=dune`, api)

    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'To Read' })).toHaveAttribute(
        'href',
        '/library?q=dune'
      )
    )
  })
})
