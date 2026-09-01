import { act, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Conversation } from '../api/types'
import { FakeLibrarianService } from './FakeLibrarianService'
import { LibrarianProvider, useLibrarian } from './LibrarianProvider'
import { LibrarianServiceProvider } from './LibrarianServiceContext'

function Probe() {
  const librarian = useLibrarian()
  return (
    <div>
      <span data-testid="open">{String(librarian.isOpen)}</span>
      <span data-testid="messages">{librarian.messages.length}</span>
      <span data-testid="load-error">{librarian.loadError?.message ?? ''}</span>
      <span data-testid="streaming-text">{librarian.streaming?.text ?? ''}</span>
      <span data-testid="sending">{String(librarian.isSending)}</span>
      <span data-testid="error">{librarian.sendError?.message ?? ''}</span>
      <button onClick={librarian.open}>open</button>
      <button onClick={librarian.close}>close</button>
      <button onClick={() => librarian.send('What should I read next?')}>send</button>
      <button onClick={() => librarian.send('make the librarian unavailable')}>send-failing</button>
    </div>
  )
}

function renderProbe(service: FakeLibrarianService) {
  render(
    <LibrarianServiceProvider service={service}>
      <LibrarianProvider>
        <Probe />
      </LibrarianProvider>
    </LibrarianServiceProvider>
  )
}

/** `getConversation()` always rejects; used to exercise the `open()` load-failure path. */
class FailingConversationService extends FakeLibrarianService {
  async getConversation(): Promise<Conversation> {
    throw new Error('Could not reach the server.')
  }
}

describe('LibrarianProvider', () => {
  it('starts closed', () => {
    renderProbe(new FakeLibrarianService({ books: [] }))
    expect(screen.getByTestId('open')).toHaveTextContent('false')
  })

  it('open() and close() toggle isOpen', async () => {
    renderProbe(new FakeLibrarianService({ books: [] }))
    await act(async () => screen.getByText('open').click())
    expect(screen.getByTestId('open')).toHaveTextContent('true')
    await act(async () => screen.getByText('close').click())
    expect(screen.getByTestId('open')).toHaveTextContent('false')
  })

  it('send() streams tokens into `streaming.text`, then resolves into `messages`', async () => {
    renderProbe(new FakeLibrarianService({ books: [{ id: 1, title: 'Dune' }] }))

    await act(async () => screen.getByText('send').click())

    await waitFor(() => expect(screen.getByTestId('sending')).toHaveTextContent('false'))
    expect(screen.getByTestId('messages')).toHaveTextContent('2')
    expect(screen.getByTestId('streaming-text')).toHaveTextContent('')
  })

  it('a failed send surfaces on sendError, without throwing out of the component', async () => {
    renderProbe(new FakeLibrarianService({ books: [] }))

    const sendButton = screen.getByText('send-failing')
    expect(() => sendButton.click()).not.toThrow()

    await waitFor(() =>
      expect(screen.getByTestId('error')).toHaveTextContent('Could not reach the server.')
    )
    expect(screen.getByTestId('sending')).toHaveTextContent('false')
  })

  it('a second send() while one is already in flight is ignored', async () => {
    renderProbe(new FakeLibrarianService({ books: [{ id: 1, title: 'Dune' }] }))

    const sendButton = screen.getByText('send')
    await act(async () => {
      sendButton.click()
      sendButton.click()
    })

    await waitFor(() => expect(screen.getByTestId('sending')).toHaveTextContent('false'))
    // One round trip, not two: a user turn and a reply, not four messages.
    expect(screen.getByTestId('messages')).toHaveTextContent('2')
  })

  it('a failed conversation load surfaces on loadError, without throwing out of the component', async () => {
    renderProbe(new FailingConversationService())

    await act(async () => screen.getByText('open').click())

    await waitFor(() =>
      expect(screen.getByTestId('load-error')).toHaveTextContent('Could not reach the server.')
    )
  })
})
