import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { ApiProvider } from '../api/ApiProvider'
import { fakeBook, fakeTag, fakeUser, FakeLibraApi } from '../api/FakeLibraApi'
import type { Tag } from '../api/types'
import { createQueryClient } from '../queryClient'
import { SessionProvider } from '../session/SessionProvider'
import { TagManager } from './TagManager'

/**
 * The dialog against the fake server, which keeps the real one's rules — a
 * name with a space, a personal tag shadowing a global one, and a global tag
 * an ordinary reader may not touch.
 */
function renderManager(tags: Tag[], { admin = false, url = '/library' } = {}) {
  const user = fakeUser({ id: 1, username: 'reader1', is_admin: admin })
  const books = [fakeBook({ id: 5, tag_ids: [2] })]
  const api = new FakeLibraApi({ users: [user], signedInAs: user, tags, books })
  render(
    <MemoryRouter initialEntries={[url]}>
      <ApiProvider api={api}>
        <QueryClientProvider client={createQueryClient()}>
          {/* The real providers, in the real order: the dialog asks the
              session whether this reader is an admin, which decides whether
              the shared-tag checkbox is there at all. */}
          <SessionProvider>
            <TagManager onClose={vi.fn()} />
            <CurrentQuery />
          </SessionProvider>
        </QueryClientProvider>
      </ApiProvider>
    </MemoryRouter>
  )
  return api
}

/** Puts the address bar's query on screen, so a test can assert on it. */
function CurrentQuery() {
  return <output data-testid="query">{useLocation().search}</output>
}

const global = (id: number, name: string) => fakeTag({ id, name })
const own = (id: number, name: string, extra: Partial<Tag> = {}) =>
  fakeTag({ id, name, owner_id: 1, is_global: false, editable: true, ...extra })

describe('TagManager', () => {
  it('splits the vocabulary into shared and mine, and counts all of it', async () => {
    renderManager([global(1, 'Sci-Fi'), own(2, 'favourites')])

    expect(await screen.findByText('Sci-Fi')).toBeInTheDocument()
    expect(screen.getByText('favourites')).toBeInTheDocument()
    expect(screen.getByText('Shared')).toBeInTheDocument()
    expect(screen.getByText('Mine')).toBeInTheDocument()
    expect(screen.getByText('2 tags')).toBeInTheDocument()
  })

  it('gives a shared tag no controls at all for an ordinary reader', async () => {
    // Not a greyed pencil: the server would refuse the write, and a control
    // that exists only to be refused is worse than no control.
    renderManager([global(1, 'Sci-Fi'), own(2, 'favourites')])
    await screen.findByText('Sci-Fi')

    expect(screen.queryByRole('button', { name: 'Rename Sci-Fi' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete Sci-Fi' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rename favourites' })).toBeInTheDocument()
  })

  it('gives an admin the controls on a shared tag, because the server would allow it', async () => {
    renderManager([global(1, 'Sci-Fi')], { admin: true })
    await screen.findByText('Sci-Fi')

    expect(screen.getByRole('button', { name: 'Rename Sci-Fi' })).toBeInTheDocument()
  })

  it('creates a tag and clears the box', async () => {
    const user = userEvent.setup()
    const api = renderManager([])
    await screen.findByText('Mine')

    await user.type(screen.getByLabelText('New tag'), 'favourites')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('favourites')).toBeInTheDocument()
    expect(screen.getByLabelText('New tag')).toHaveValue('')
    expect(api.tags.map((tag) => tag.name)).toEqual(['favourites'])
  })

  it('offers no shared-tag checkbox to an ordinary reader', async () => {
    // The server answers a reader asking for a global tag with a 403, so the
    // box is not there to tick rather than there and refused.
    renderManager([])
    await screen.findByText('Mine')

    expect(screen.queryByLabelText('Shared with everyone')).not.toBeInTheDocument()
  })

  it('creates a shared tag when an admin ticks the box', async () => {
    const user = userEvent.setup()
    const api = renderManager([], { admin: true })
    await screen.findByText('Mine')

    await user.type(screen.getByLabelText('New tag'), 'sci-fi')
    await user.click(screen.getByLabelText('Shared with everyone'))
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Shared')).toBeInTheDocument()
    expect(api.tags[0]).toMatchObject({ name: 'sci-fi', is_global: true, owner_id: null })
  })

  it('says what sharing does, and only when it is about to happen', async () => {
    const user = userEvent.setup()
    renderManager([], { admin: true })
    await screen.findByText('Mine')

    expect(screen.queryByText(/Everyone on this instance sees/)).not.toBeInTheDocument()

    await user.click(screen.getByLabelText('Shared with everyone'))

    expect(screen.getByText(/Everyone on this instance sees this tag/)).toBeInTheDocument()
  })

  it('unticks the box after a shared tag is made, so the next one is not shared by accident', async () => {
    const user = userEvent.setup()
    const api = renderManager([], { admin: true })
    await screen.findByText('Mine')

    await user.type(screen.getByLabelText('New tag'), 'sci-fi')
    await user.click(screen.getByLabelText('Shared with everyone'))
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await screen.findByText('Shared')

    expect(screen.getByLabelText('Shared with everyone')).not.toBeChecked()

    await user.type(screen.getByLabelText('New tag'), 'mine-only')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(api.tags).toHaveLength(2))
    expect(api.tags[1]).toMatchObject({ name: 'mine-only', is_global: false })
  })

  it('says the no-spaces rule before the server has to refuse it', async () => {
    renderManager([])

    expect(await screen.findByText(/One word, with no spaces/)).toBeInTheDocument()
  })

  it('keeps a name with a space in the box, with the server’s reason', async () => {
    const user = userEvent.setup()
    const api = renderManager([])
    await screen.findByText('Mine')

    await user.type(screen.getByLabelText('New tag'), 'lent out')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    // Not /hyphen/: the hint under the field says that too, which is the
    // point of it. This asserts the server's own refusal reached the screen.
    expect(await screen.findByText(/cannot contain spaces/)).toBeInTheDocument()
    expect(screen.getByLabelText('New tag')).toHaveValue('lent out')
    expect(api.tags).toEqual([])
  })

  it('keeps a refused duplicate in the box to be corrected', async () => {
    const user = userEvent.setup()
    renderManager([own(2, 'favourites')])
    await screen.findByText('favourites')

    await user.type(screen.getByLabelText('New tag'), 'Favourites')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText(/already have a tag with that name/)).toBeInTheDocument()
    expect(screen.getByLabelText('New tag')).toHaveValue('Favourites')
  })

  it('renames a tag from the row itself', async () => {
    const user = userEvent.setup()
    const api = renderManager([own(2, 'favourites')])
    await screen.findByText('favourites')

    await user.click(screen.getByRole('button', { name: 'Rename favourites' }))
    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'keepers')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('keepers')).toBeInTheDocument()
    expect(api.tags[0]?.name).toBe('keepers')
  })

  it('throws away a rename when it is cancelled', async () => {
    const user = userEvent.setup()
    const api = renderManager([own(2, 'favourites')])
    await screen.findByText('favourites')

    await user.click(screen.getByRole('button', { name: 'Rename favourites' }))
    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'abandoned')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByText('favourites')).toBeInTheDocument()
    expect(api.tags[0]?.name).toBe('favourites')
  })

  it('will not save an empty name', async () => {
    const user = userEvent.setup()
    renderManager([own(2, 'favourites')])
    await screen.findByText('favourites')

    await user.click(screen.getByRole('button', { name: 'Rename favourites' }))
    await user.clear(screen.getByLabelText('Name'))

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('asks before deleting, and says how many books it comes off', async () => {
    const user = userEvent.setup()
    const api = renderManager([own(2, 'favourites')])
    await screen.findByText('favourites')

    await user.click(screen.getByRole('button', { name: 'Delete favourites' }))
    expect(screen.getByText(/comes off 1 book, which stay/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(api.tags).toEqual([]))
    // The book itself stays; only the label comes off it.
    expect(api.books[0]?.tag_ids).toEqual([])
  })

  it('takes a deleted tag out of the filter, so the grid is not left filtering by nothing', async () => {
    const user = userEvent.setup()
    renderManager([own(2, 'favourites'), own(3, 'lent-out')], { url: '/library?tags=2,3&q=dune' })
    await screen.findByText('favourites')

    await user.click(screen.getByRole('button', { name: 'Delete favourites' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    // The other tag and the text query are untouched: only the id that no
    // longer exists goes.
    await waitFor(() => expect(screen.getByTestId('query')).toHaveTextContent('tags=3'))
    expect(screen.getByTestId('query')).toHaveTextContent('q=dune')
  })

  it('leaves the address alone when the deleted tag was not filtering anything', async () => {
    const user = userEvent.setup()
    renderManager([own(2, 'favourites'), own(3, 'lent-out')], { url: '/library?tags=3' })
    await screen.findByText('favourites')

    await user.click(screen.getByRole('button', { name: 'Delete favourites' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(screen.queryByText('favourites')).not.toBeInTheDocument())
    expect(screen.getByTestId('query')).toHaveTextContent('tags=3')
  })

  it('drops the tags parameter entirely when the last one is deleted', async () => {
    const user = userEvent.setup()
    renderManager([own(2, 'favourites')], { url: '/library?tags=2' })
    await screen.findByText('favourites')

    await user.click(screen.getByRole('button', { name: 'Delete favourites' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    // Not `?tags=`, which would be an empty filter rather than no filter.
    await waitFor(() => expect(screen.getByTestId('query')).toHaveTextContent(''))
    expect(screen.getByTestId('query').textContent).toBe('')
  })

  it('deletes nothing when the confirmation is refused', async () => {
    const user = userEvent.setup()
    const api = renderManager([own(2, 'favourites')])
    await screen.findByText('favourites')

    await user.click(screen.getByRole('button', { name: 'Delete favourites' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(api.tags).toHaveLength(1)
  })
})
