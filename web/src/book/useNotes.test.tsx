import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ApiProvider } from '../api/ApiProvider'
import { fakeBook, fakeNote, fakeUser, FakeLibraApi } from '../api/FakeLibraApi'
import { createQueryClient } from '../queryClient'
import { useCreateNote, useDeleteNote, useNotes } from './useNotes'

function renderProbe(api: FakeLibraApi, bookId: number) {
  function Probe() {
    const notes = useNotes(bookId)
    const create = useCreateNote(bookId)
    const remove = useDeleteNote(bookId)

    return (
      <div>
        <p data-testid="notes">{notes.data?.map((note) => note.text).join() ?? 'loading'}</p>
        <button type="button" onClick={() => create.mutate({ text: 'Fresh' })}>
          add
        </button>
        <button type="button" onClick={() => remove.mutate(notes.data?.[0]?.id ?? 0)}>
          delete first
        </button>
      </div>
    )
  }

  return render(
    <ApiProvider api={api}>
      <QueryClientProvider client={createQueryClient()}>
        <Probe />
      </QueryClientProvider>
    </ApiProvider>
  )
}

function signedIn(notes = [fakeNote({ user_id: 1, book_id: 1, text: 'First' })]) {
  const user = fakeUser({ id: 1 })
  return new FakeLibraApi({
    users: [user],
    signedInAs: user,
    books: [fakeBook({ id: 1 })],
    notes,
  })
}

describe('useNotes', () => {
  it('reads the notes for one book', async () => {
    renderProbe(signedIn(), 1)

    await waitFor(() => expect(screen.getByTestId('notes')).toHaveTextContent('First'))
  })

  it('shows a new note without the caller refetching by hand', async () => {
    const user = userEvent.setup()
    renderProbe(signedIn(), 1)
    await waitFor(() => expect(screen.getByTestId('notes')).toHaveTextContent('First'))

    await user.click(screen.getByRole('button', { name: 'add' }))

    // Newest first, so the added note leads.
    await waitFor(() => expect(screen.getByTestId('notes')).toHaveTextContent('Fresh,First'))
  })

  it('drops a deleted note from the list', async () => {
    const user = userEvent.setup()
    renderProbe(signedIn(), 1)
    await waitFor(() => expect(screen.getByTestId('notes')).toHaveTextContent('First'))

    await user.click(screen.getByRole('button', { name: 'delete first' }))

    await waitFor(() => expect(screen.getByTestId('notes')).toHaveTextContent(''))
  })
})
