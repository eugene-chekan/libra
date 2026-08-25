import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { ApiProvider } from '../api/ApiProvider'
import { fakeBook, fakeTag, fakeUser, FakeLibraApi } from '../api/FakeLibraApi'
import type { FakeBook } from '../api/FakeLibraApi'
import type { Tag } from '../api/types'
import { createQueryClient } from '../queryClient'
import { SessionProvider } from '../session/SessionProvider'
import { BookTags } from './BookTags'

/**
 * The tags on a book, and the control that puts them there.
 *
 * Every rule here is one the server enforces and the client has to match
 * exactly: who may hang a global tag, and — the awkward half — how much of the
 * book's current tags a write is allowed to name, since `PUT /state` replaces
 * whatever it is sent.
 */
function renderTags(book: FakeBook, tags: Tag[], isAdmin = false) {
  const user = fakeUser({ id: 1, is_admin: isAdmin })
  const api = new FakeLibraApi({ users: [user], signedInAs: user, books: [book], tags })
  render(
    <ApiProvider api={api}>
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter>
          <SessionProvider>
            <BookTags book={book} />
          </SessionProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </ApiProvider>
  )
  return api
}

const personal = (id: number, name: string) => fakeTag({ id, name, owner_id: 1, is_global: false })
const shared = (id: number, name: string) => fakeTag({ id, name, owner_id: null, is_global: true })

describe('BookTags', () => {
  it("shows the book's tags as links back into the library", async () => {
    renderTags(fakeBook({ id: 1, tag_ids: [7] }), [personal(7, 'lent-out')])

    expect(await screen.findByRole('link', { name: 'lent-out' })).toHaveAttribute(
      'href',
      '/library?tags=7'
    )
  })

  it('puts a tag on the book as soon as it is picked, with no Save step', async () => {
    // A tag is the reader's own state, like the rating beside it. There is
    // nothing to confirm and nobody else to agree with.
    const user = userEvent.setup()
    const book = fakeBook({ id: 1, tag_ids: [] })
    renderTags(book, [personal(7, 'lent-out')])

    await user.click(screen.getByRole('button', { name: /Add Tag/ }))
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'lent-out' }))

    await waitFor(() => expect(book.tag_ids).toEqual([7]))
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('takes a tag off again when it is picked a second time', async () => {
    const user = userEvent.setup()
    const book = fakeBook({ id: 1, tag_ids: [7] })
    renderTags(book, [personal(7, 'lent-out')])

    await user.click(screen.getByRole('button', { name: /Add Tag/ }))
    await user.click(await screen.findByRole('menuitemcheckbox', { name: /lent-out/ }))

    await waitFor(() => expect(book.tag_ids).toEqual([]))
  })

  it('keeps the rating and progress it was not asked to change', async () => {
    // `PUT /state` is a PUT: a field left out is set to zero, not left alone.
    const user = userEvent.setup()
    const book = fakeBook({ id: 1, tag_ids: [], rating: 4, progress: 0.5 })
    renderTags(book, [personal(7, 'lent-out')])

    await user.click(screen.getByRole('button', { name: /Add Tag/ }))
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'lent-out' }))

    await waitFor(() => expect(book.tag_ids).toEqual([7]))
    expect(book.rating).toBe(4)
    expect(book.progress).toBe(0.5)
  })

  it('offers an ordinary reader no shared tag, because the server would refuse it', async () => {
    const user = userEvent.setup()
    renderTags(fakeBook({ id: 1, tag_ids: [] }), [personal(7, 'lent-out'), shared(8, 'sci-fi')])

    await user.click(screen.getByRole('button', { name: /Add Tag/ }))

    expect(await screen.findByRole('menuitemcheckbox', { name: 'lent-out' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitemcheckbox', { name: 'sci-fi' })).not.toBeInTheDocument()
  })

  it('leaves a shared tag on the book when a reader changes their own', async () => {
    // A reader's write must name only their own tags. Naming the shared one
    // is a 403; leaving it out is what keeps it where it is.
    const user = userEvent.setup()
    const book = fakeBook({ id: 1, tag_ids: [8] })
    renderTags(book, [personal(7, 'lent-out'), shared(8, 'sci-fi')])

    await user.click(screen.getByRole('button', { name: /Add Tag/ }))
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'lent-out' }))

    await waitFor(() => expect(book.tag_ids).toEqual([8, 7]))
  })

  it('lets an admin hang a shared tag, which is what curating one is for', async () => {
    const user = userEvent.setup()
    const book = fakeBook({ id: 1, tag_ids: [] })
    renderTags(book, [shared(8, 'sci-fi')], true)

    await user.click(screen.getByRole('button', { name: /Add Tag/ }))
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'sci-fi' }))

    await waitFor(() => expect(book.tag_ids).toEqual([8]))
  })

  it('lets an admin take a shared tag off without dropping their own', async () => {
    // An admin's write replaces global tags too, so it has to name every tag
    // that should stay — including their personal ones.
    const user = userEvent.setup()
    const book = fakeBook({ id: 1, tag_ids: [8, 7] })
    renderTags(book, [personal(7, 'lent-out'), shared(8, 'sci-fi')], true)

    await user.click(screen.getByRole('button', { name: /Add Tag/ }))
    await user.click(await screen.findByRole('menuitemcheckbox', { name: /sci-fi/ }))

    await waitFor(() => expect(book.tag_ids).toEqual([7]))
  })

  it('says so when there are no tags to pick yet', async () => {
    const user = userEvent.setup()
    renderTags(fakeBook({ id: 1, tag_ids: [] }), [])

    await user.click(screen.getByRole('button', { name: /Add Tag/ }))

    expect(await screen.findByText('No tags yet')).toBeInTheDocument()
  })

  it('closes after a pick, so the menu never jumps as the row grows', async () => {
    // Adding a pill widens the row and pushes the trigger right. A menu that
    // stayed open would move out from under the pointer, which is worse than
    // opening it again.
    const user = userEvent.setup()
    const book = fakeBook({ id: 1, tag_ids: [] })
    renderTags(book, [personal(7, 'lent-out'), personal(9, 'owned')])

    await user.click(screen.getByRole('button', { name: /Add Tag/ }))
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'lent-out' }))

    await waitFor(() =>
      expect(screen.queryByRole('menuitemcheckbox', { name: 'owned' })).not.toBeInTheDocument()
    )
  })

  it('reports a refused write where the tags are', async () => {
    const user = userEvent.setup()
    const book = fakeBook({ id: 1, tag_ids: [] })
    const api = renderTags(book, [personal(7, 'lent-out')])
    api.signedInId = null

    await user.click(screen.getByRole('button', { name: /Add Tag/ }))
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'lent-out' }))

    // The menu closes on a pick, so the block below it is reachable again.
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})
