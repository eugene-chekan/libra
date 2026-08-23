import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ApiProvider } from '../api/ApiProvider'
import { fakeBook, fakeUser, FakeLibraApi } from '../api/FakeLibraApi'
import { useBooks } from '../library/useBooks'
import { createQueryClient } from '../queryClient'
import { useBook, useSetBookState, useUpdateBook } from './useBook'

/**
 * The point of these tests is the *invalidation*, not the request. A write
 * that lands on the server but leaves the grid showing the old rating is the
 * failure a reader actually meets, and it is invisible to a test that only
 * checks the mutation resolved.
 */
function renderProbe(api: FakeLibraApi, bookId: number) {
  function Probe() {
    const book = useBook(bookId)
    const books = useBooks({})
    const setState = useSetBookState(bookId)
    const update = useUpdateBook(bookId)

    return (
      <div>
        <p data-testid="rating">{book.data ? `rating ${book.data.rating}` : 'loading'}</p>
        <p data-testid="grid">{books.data?.items.map((b) => `${b.title}:${b.rating}`).join()}</p>
        <button type="button" onClick={() => setState.mutate({ rating: 5, progress: 0.25 })}>
          rate
        </button>
        <button type="button" onClick={() => update.mutate({ title: 'Corrected' })}>
          correct
        </button>
        {update.isError && <p data-testid="update-error">{update.error.message}</p>}
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

type FakeOptions = NonNullable<ConstructorParameters<typeof FakeLibraApi>[0]>

/** A fake with one ordinary reader already signed in. */
function signedIn(overrides: Omit<FakeOptions, 'users' | 'signedInAs'> = {}) {
  const user = fakeUser({ id: 1 })
  return new FakeLibraApi({ users: [user], signedInAs: user, ...overrides })
}

describe('useBook', () => {
  it('reads one book by id', async () => {
    const api = signedIn({ books: [fakeBook({ id: 4, rating: 3 })] })

    renderProbe(api, 4)

    await waitFor(() => expect(screen.getByTestId('rating')).toHaveTextContent('rating 3'))
  })

  it('refreshes the book and the library grid after a state write', async () => {
    const user = userEvent.setup()
    const api = signedIn({ books: [fakeBook({ id: 4, title: 'Dune', rating: 0 })] })

    renderProbe(api, 4)
    await waitFor(() => expect(screen.getByTestId('grid')).toHaveTextContent('Dune:0'))

    await user.click(screen.getByRole('button', { name: 'rate' }))

    // Both, not just the one that was written. The grid draws a status line
    // from the same rating, and a stale one there is the reader seeing two
    // different answers on two screens.
    await waitFor(() => expect(screen.getByTestId('rating')).toHaveTextContent('rating 5'))
    await waitFor(() => expect(screen.getByTestId('grid')).toHaveTextContent('Dune:5'))
  })

  it('surfaces the refusal when a reader who is not an admin edits the catalog', async () => {
    const user = userEvent.setup()
    const reader = fakeUser({ id: 1, is_admin: false })
    const api = new FakeLibraApi({
      users: [reader],
      signedInAs: reader,
      books: [fakeBook({ id: 4, title: 'Dune' })],
    })

    renderProbe(api, 4)
    await waitFor(() => expect(screen.getByTestId('rating')).toHaveTextContent('rating 0'))

    await user.click(screen.getByRole('button', { name: 'correct' }))

    await waitFor(() => expect(screen.getByTestId('update-error')).toHaveTextContent('Admin only'))
    expect(screen.getByTestId('grid')).toHaveTextContent('Dune:0')
  })
})
