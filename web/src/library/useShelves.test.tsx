import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ApiProvider } from '../api/ApiProvider'
import { fakeShelf, fakeUser, FakeLibraApi } from '../api/FakeLibraApi'
import { createQueryClient } from '../queryClient'
import { useShelves } from './useShelves'

describe('useShelves', () => {
  it("resolves to the caller's visible shelves", async () => {
    const user = fakeUser()
    const api = new FakeLibraApi({
      users: [user],
      signedInAs: user,
      shelves: [fakeShelf({ name: 'To Read', owner_id: user.id })],
    })

    function Probe() {
      const { data, isPending } = useShelves()
      if (isPending) return null
      return <div data-testid="names">{data?.map((s) => s.name).join(', ')}</div>
    }

    render(
      <ApiProvider api={api}>
        <QueryClientProvider client={createQueryClient()}>
          <Probe />
        </QueryClientProvider>
      </ApiProvider>
    )

    await waitFor(() => expect(screen.getByTestId('names')).toHaveTextContent('To Read'))
  })
})
