import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { ApiProvider } from '../api/ApiProvider'
import { fakeTag, fakeUser, FakeLibraApi } from '../api/FakeLibraApi'
import { createQueryClient } from '../queryClient'
import { TagsSection } from './TagsSection'

function renderAt(path: string, api: FakeLibraApi) {
  return render(
    <ApiProvider api={api}>
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="*" element={<TagsSection />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </ApiProvider>
  )
}

function signedInApi(overrides: ConstructorParameters<typeof FakeLibraApi>[0] = {}) {
  const user = fakeUser()
  return new FakeLibraApi({ users: [user], signedInAs: user, ...overrides })
}

describe('TagsSection', () => {
  it("lists the caller's visible tags — global and their own", async () => {
    const api = signedInApi({ tags: [fakeTag({ name: 'sci-fi' }), fakeTag({ name: 'fantasy' })] })

    renderAt('/library', api)

    await waitFor(() => expect(screen.getByText('sci-fi')).toBeInTheDocument())
    expect(screen.getByText('fantasy')).toBeInTheDocument()
  })

  it('adds a tag id to the URL, alongside any already there, when its row is clicked', async () => {
    const tagA = fakeTag({ name: 'sci-fi' })
    const tagB = fakeTag({ name: 'fantasy' })
    const api = signedInApi({ tags: [tagA, tagB] })

    renderAt(`/library?tags=${tagA.id}`, api)

    await waitFor(() =>
      expect(screen.getByRole('link', { name: /fantasy/i })).toHaveAttribute(
        'href',
        `/library?tags=${tagA.id}%2C${tagB.id}`
      )
    )
  })

  it('removes a tag id, leaving the rest, when its already-active row is clicked', async () => {
    const tagA = fakeTag({ name: 'sci-fi' })
    const tagB = fakeTag({ name: 'fantasy' })
    const api = signedInApi({ tags: [tagA, tagB] })

    renderAt(`/library?tags=${tagA.id}%2C${tagB.id}`, api)

    await waitFor(() =>
      expect(screen.getByRole('link', { name: /sci-fi/i })).toHaveAttribute(
        'href',
        `/library?tags=${tagB.id}`
      )
    )
  })

  it('marks an active tag distinctly, with the accent dot the design specifies', async () => {
    const tag = fakeTag({ name: 'sci-fi' })
    const api = signedInApi({ tags: [tag] })

    renderAt(`/library?tags=${tag.id}`, api)

    await waitFor(() =>
      expect(screen.getByRole('link', { name: /sci-fi/i })).toHaveAttribute('aria-current', 'true')
    )
  })
})
