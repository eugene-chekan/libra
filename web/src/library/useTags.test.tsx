import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ApiProvider } from '../api/ApiProvider'
import { fakeTag, fakeUser, FakeLibraApi } from '../api/FakeLibraApi'
import { createQueryClient } from '../queryClient'
import { useTags } from './useTags'

describe('useTags', () => {
  it("resolves to the caller's visible tags", async () => {
    const user = fakeUser()
    const api = new FakeLibraApi({
      users: [user],
      signedInAs: user,
      tags: [fakeTag({ name: 'sci-fi' })],
    })

    function Probe() {
      const { data, isPending } = useTags()
      if (isPending) return null
      return <div data-testid="names">{data?.map((t) => t.name).join(', ')}</div>
    }

    render(
      <ApiProvider api={api}>
        <QueryClientProvider client={createQueryClient()}>
          <Probe />
        </QueryClientProvider>
      </ApiProvider>
    )

    await waitFor(() => expect(screen.getByTestId('names')).toHaveTextContent('sci-fi'))
  })
})
