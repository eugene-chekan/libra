import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { ApiProvider } from '../api/ApiProvider'
import { fakeUser, FakeLibraApi } from '../api/FakeLibraApi'
import { FakeLibrarianService } from '../librarian/FakeLibrarianService'
import { LibrarianPanel } from '../librarian/LibrarianPanel'
import { LibrarianProvider } from '../librarian/LibrarianProvider'
import { LibrarianServiceProvider } from '../librarian/LibrarianServiceContext'
import { createQueryClient } from '../queryClient'
import { ReaderBar } from './ReaderBar'

/** Mirrors App: the panel sits beside the provider, not inside any one screen. */
function renderBar(props: Partial<Parameters<typeof ReaderBar>[0]> = {}) {
  const user = fakeUser({ id: 1 })
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ApiProvider api={new FakeLibraApi({ users: [user], signedInAs: user })}>
        <LibrarianServiceProvider service={new FakeLibrarianService()}>
          <MemoryRouter>
            <LibrarianProvider>
              <ReaderBar
                title="The Locked Door"
                progress={0.38}
                backTo="/books/1"
                onContents={vi.fn()}
                onAppearance={vi.fn()}
                {...props}
              />
              <LibrarianPanel />
            </LibrarianProvider>
          </MemoryRouter>
        </LibrarianServiceProvider>
      </ApiProvider>
    </QueryClientProvider>
  )
}

describe('ReaderBar', () => {
  it('names the book and links back to it', () => {
    renderBar()

    expect(screen.getByText('The Locked Door')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/books/1')
  })

  it('labels every icon-only control', () => {
    renderBar()

    expect(screen.getByRole('button', { name: 'Contents' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Text size and width' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ask the librarian' })).toBeInTheDocument()
  })

  it('reports how far through the book the reader is', () => {
    renderBar({ progress: 0.38 })

    expect(screen.getByRole('progressbar', { name: 'Reading progress' })).toHaveAttribute(
      'aria-valuenow',
      '38'
    )
  })

  it('calls out to open the contents and the text sizes', async () => {
    const onContents = vi.fn()
    const onAppearance = vi.fn()
    renderBar({ onContents, onAppearance })

    await userEvent.click(screen.getByRole('button', { name: 'Contents' }))
    await userEvent.click(screen.getByRole('button', { name: 'Text size and width' }))

    expect(onContents).toHaveBeenCalledOnce()
    expect(onAppearance).toHaveBeenCalledOnce()
  })

  it('opens the librarian, which is why the reader can lose the sidebar', async () => {
    renderBar()

    await userEvent.click(screen.getByRole('button', { name: 'Ask the librarian' }))

    expect(await screen.findByRole('heading', { name: 'Librarian' })).toBeInTheDocument()
  })
})
