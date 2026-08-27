import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ApiProvider } from '../api/ApiProvider'
import { fakeUser, FakeLibraApi } from '../api/FakeLibraApi'
import { createQueryClient } from '../queryClient'
import { useUsers } from './useUsers'

describe('useUsers', () => {
  it('resolves to every account, for an admin', async () => {
    const admin = fakeUser({ username: 'admin', is_admin: true })
    const reader = fakeUser({ username: 'reader' })
    const api = new FakeLibraApi({ users: [admin, reader], signedInAs: admin })

    function Probe() {
      const { data, isPending } = useUsers()
      if (isPending) return null
      return <div data-testid="names">{data?.map((u) => u.username).join(', ')}</div>
    }

    render(
      <ApiProvider api={api}>
        <QueryClientProvider client={createQueryClient()}>
          <Probe />
        </QueryClientProvider>
      </ApiProvider>
    )

    await waitFor(() => expect(screen.getByTestId('names')).toHaveTextContent('admin, reader'))
  })
})
