import { describe, expect, it } from 'vitest'

import { ApiError } from '../api/errors'
import { FakeLibrarianService } from './FakeLibrarianService'
import type { LibrarianEvent } from './LibrarianService'

async function drain(events: AsyncIterable<LibrarianEvent>): Promise<LibrarianEvent[]> {
  const collected: LibrarianEvent[] = []
  for await (const event of events) collected.push(event)
  return collected
}

describe('FakeLibrarianService', () => {
  it('starts with an empty conversation', async () => {
    const service = new FakeLibrarianService({ books: [] })
    const conversation = await service.getConversation()
    expect(conversation.messages).toEqual([])
  })

  it('recommends the one book in the library and cites it', async () => {
    const service = new FakeLibrarianService({ books: [{ id: 1, title: 'Dune' }] })

    const events = await drain(service.sendMessage(1, 'What should I read next?'))

    const text = events
      .filter((e) => e.type === 'token')
      .map((e) => e.text)
      .join('')
    expect(text).toContain('Dune')
    expect(events.some((e) => e.type === 'citation' && e.book_id === 1)).toBe(true)
    expect(events.at(-1)?.type).toBe('done')
  })

  it('opens with a searching status, then a done status naming the book count', async () => {
    const service = new FakeLibrarianService({ books: [{ id: 1, title: 'Dune' }] })

    const events = await drain(service.sendMessage(1, 'next?'))

    expect(events[0]).toEqual({
      type: 'tool_status',
      status: 'searching',
      label: 'Searching your library…',
    })
    const done = events[1]
    expect(done).toMatchObject({
      type: 'tool_status',
      status: 'done',
      summary: expect.stringContaining('1 book'),
    })
  })

  it('replies with nothing-found and no citation when the library is empty', async () => {
    const service = new FakeLibrarianService({ books: [] })

    const events = await drain(service.sendMessage(1, 'What should I read next?'))

    const text = events
      .filter((e) => e.type === 'token')
      .map((e) => e.text)
      .join('')
      .trim()
    expect(text).toBe("I couldn't find anything in your library about that.")
    expect(events.some((e) => e.type === 'citation')).toBe(false)
  })

  it('appends both the reader message and the reply to the conversation', async () => {
    const service = new FakeLibrarianService({ books: [{ id: 1, title: 'Dune' }] })

    await drain(service.sendMessage(1, 'next?'))
    const conversation = await service.getConversation()

    expect(conversation.messages.map((m) => m.role)).toEqual(['user', 'librarian'])
    expect(conversation.messages[0]?.content).toBe('next?')
  })

  it('throws an ApiError for the unavailable trigger, after recording the reader message', async () => {
    const service = new FakeLibrarianService({ books: [] })

    await expect(drain(service.sendMessage(1, 'make the librarian unavailable'))).rejects.toThrow(
      ApiError
    )
    const conversation = await service.getConversation()
    expect(conversation.messages).toHaveLength(1)
    expect(conversation.messages[0]?.role).toBe('user')
  })

  it('replies with the not-indexed message for the trigger phrase', async () => {
    const service = new FakeLibrarianService({ books: [{ id: 1, title: 'Dune' }] })

    const events = await drain(service.sendMessage(1, 'tell me about not-indexed-test'))

    const text = events
      .filter((e) => e.type === 'token')
      .map((e) => e.text)
      .join('')
    expect(text).toContain('indexed')
    expect(events.some((e) => e.type === 'citation')).toBe(false)
  })
})
