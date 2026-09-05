import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ApiProvider } from '../api/ApiProvider'
import { FakeLibraApi } from '../api/FakeLibraApi'
import type { Health } from '../api/types'
import { createQueryClient } from '../queryClient'
import { VersionLine } from './VersionLine'

function renderLine(api: FakeLibraApi) {
  render(
    <ApiProvider api={api}>
      <QueryClientProvider client={createQueryClient()}>
        <VersionLine />
      </QueryClientProvider>
    </ApiProvider>
  )
}

function apiReporting(health: Health) {
  return new FakeLibraApi({ health })
}

describe('VersionLine', () => {
  it('names the version the server reports', async () => {
    renderLine(apiReporting({ status: 'ok', version: '0.4.2' }))

    expect(await screen.findByText('libra 0.4.2')).toBeInTheDocument()
  })

  it('adds the commit when the build was stamped with one', async () => {
    renderLine(apiReporting({ status: 'ok', version: '0.4.2', build: 'a1b2c3d' }))

    expect(await screen.findByText('libra 0.4.2 · a1b2c3d')).toBeInTheDocument()
  })

  it('says nothing at all when the server does not answer', async () => {
    const api = new FakeLibraApi()
    api.health = () => Promise.reject(new Error('down'))

    const { container } = render(
      <ApiProvider api={api}>
        <QueryClientProvider client={createQueryClient()}>
          <VersionLine />
        </QueryClientProvider>
      </ApiProvider>
    )

    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })
})
