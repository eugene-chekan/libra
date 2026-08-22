import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ApiProvider } from '../api/ApiProvider'
import { fakeBook, fakeUser, FakeLibraApi } from '../api/FakeLibraApi'
import { createQueryClient } from '../queryClient'
import { useBooks } from './useBooks'

function renderHook(api: FakeLibraApi, params: Parameters<typeof useBooks>[0] = {}) {
  function Probe() {
    const { data, isPending, isError } = useBooks(params)
    if (isPending) return <div>loading</div>
    if (isError) return <div>error</div>
    return <div data-testid="titles">{data.items.map((b) => b.title).join(', ')}</div>
  }

  return render(
    <ApiProvider api={api}>
      <QueryClientProvider client={createQueryClient()}>
        <Probe />
      </QueryClientProvider>
    </ApiProvider>
  )
}

describe('useBooks', () => {
  it('resolves to the matching books', async () => {
    const user = fakeUser()
    const api = new FakeLibraApi({
      users: [user],
      signedInAs: user,
      books: [fakeBook({ title: 'Dune' }), fakeBook({ title: 'Anna Karenina' })],
    })

    renderHook(api)

    expect(screen.getByText('loading')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByTestId('titles')).toHaveTextContent('Anna Karenina, Dune')
    )
  })

  it('passes the filter params straight through to listBooks', async () => {
    const user = fakeUser()
    const api = new FakeLibraApi({
      users: [user],
      signedInAs: user,
      books: [
        fakeBook({ title: 'Dune', author: 'Herbert' }),
        fakeBook({ title: 'Emma', author: 'Austen' }),
      ],
    })

    renderHook(api, { q: 'herbert' })

    await waitFor(() => expect(screen.getByTestId('titles')).toHaveTextContent('Dune'))
  })

  it('surfaces a failed request as an error rather than throwing', async () => {
    const api = new FakeLibraApi() // signed out — listBooks() 401s

    renderHook(api)

    await waitFor(() => expect(screen.getByText('error')).toBeInTheDocument())
  })
})
