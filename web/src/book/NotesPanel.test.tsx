import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ApiProvider } from '../api/ApiProvider'
import { fakeBook, fakeNote, fakeUser, FakeLibraApi } from '../api/FakeLibraApi'
import { createQueryClient } from '../queryClient'
import { NotesPanel } from './NotesPanel'

function renderPanel(api: FakeLibraApi, bookId = 1) {
  return render(
    <ApiProvider api={api}>
      <QueryClientProvider client={createQueryClient()}>
        <NotesPanel bookId={bookId} />
      </QueryClientProvider>
    </ApiProvider>
  )
}

function apiWith(notes = [fakeNote({ user_id: 1, book_id: 1, text: 'A first thought' })]) {
  const user = fakeUser({ id: 1 })
  return new FakeLibraApi({
    users: [user],
    signedInAs: user,
    books: [fakeBook({ id: 1 })],
    notes,
  })
}

describe('NotesPanel', () => {
  it('lists the notes on this book', async () => {
    renderPanel(apiWith())

    expect(await screen.findByText('A first thought')).toBeInTheDocument()
  })

  it('says so when there are none, rather than showing an empty panel', async () => {
    renderPanel(apiWith([]))

    expect(await screen.findByText('No notes yet.')).toBeInTheDocument()
  })

  it('adds a note and clears the box', async () => {
    const user = userEvent.setup()
    const api = apiWith([])
    renderPanel(api)
    await screen.findByText('No notes yet.')

    await user.type(screen.getByLabelText('New note'), 'The reveal changes everything.')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('The reveal changes everything.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('New note')).toHaveValue(''))
  })

  it('sends nothing for a box holding only spaces', async () => {
    const user = userEvent.setup()
    const api = apiWith([])
    renderPanel(api)
    await screen.findByText('No notes yet.')

    await user.type(screen.getByLabelText('New note'), '   ')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(api.calls.filter((call) => call.startsWith('createNote'))).toHaveLength(0)
  })

  it('deletes a note, naming which one in the button', async () => {
    const user = userEvent.setup()
    renderPanel(apiWith())
    await screen.findByText('A first thought')

    // Icon-only controls carry their own accessible name — there is no
    // visible label beside them to borrow one from.
    await user.click(screen.getByRole('button', { name: 'Delete note: A first thought' }))

    expect(await screen.findByText('No notes yet.')).toBeInTheDocument()
  })

  it('keeps what was typed when the write fails', async () => {
    // Clearing the box on submit rather than on success would throw away what
    // somebody wrote the moment the network hiccuped.
    const user = userEvent.setup()
    const api = apiWith([])
    renderPanel(api)
    await screen.findByText('No notes yet.')

    // The session ends between the list and the write, which is the ordinary
    // way a write fails while what is on screen still looks fine.
    api.signedInId = null

    await user.type(screen.getByLabelText('New note'), 'Worth keeping')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByLabelText('New note')).toHaveValue('Worth keeping')
  })
})
