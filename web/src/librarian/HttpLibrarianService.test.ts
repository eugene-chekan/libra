import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../api/errors'
import { HttpLibrarianService } from './HttpLibrarianService'
import type { LibrarianEvent } from './LibrarianService'

function sseBody(frames: object[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const text = frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join('')
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text))
      controller.close()
    },
  })
}

/** The same wire bytes as {@link sseBody}, but delivered as separate `read()` chunks split at given byte offsets. */
function chunkedSseBody(frames: object[], splitAt: number[]): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(
    frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join('')
  )
  const bounds = [0, ...splitAt, bytes.length]
  return new ReadableStream({
    start(controller) {
      for (let i = 0; i < bounds.length - 1; i++) {
        controller.enqueue(bytes.slice(bounds[i], bounds[i + 1]))
      }
      controller.close()
    },
  })
}

async function drain(events: AsyncIterable<LibrarianEvent>): Promise<LibrarianEvent[]> {
  const collected: LibrarianEvent[] = []
  for await (const event of events) collected.push(event)
  return collected
}

describe('HttpLibrarianService', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** The arguments `fetch` was last called with, typed rather than `any[] | undefined`. */
  function lastFetchCall(): [string, RequestInit] {
    const call = fetchMock.mock.calls.at(-1) as [string, RequestInit] | undefined
    if (!call) throw new Error('fetch was never called')
    return call
  }

  it('fetches the conversation from its own endpoint, credentialed', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: 1, messages: [] }), { status: 200 })
    )

    const service = new HttpLibrarianService()
    const conversation = await service.getConversation()

    expect(conversation).toEqual({ id: 1, messages: [] })
    const [url, init] = lastFetchCall()
    expect(url).toBe('/api/conversations/mine')
    expect(init.credentials).toBe('include')
  })

  it('posts the message, then parses each SSE frame off the stream', async () => {
    const frames = [
      { type: 'tool_status', status: 'searching', label: 'Searching your library…' },
      { type: 'token', text: 'Dune ' },
      { type: 'citation', book_id: 1, title: 'Dune' },
      { type: 'done', message_id: 7 },
    ]
    fetchMock.mockResolvedValue(
      new Response(sseBody(frames), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    )

    const service = new HttpLibrarianService()
    const events = await drain(service.sendMessage(3, 'next?'))

    expect(events).toEqual(frames)
    const [url, init] = lastFetchCall()
    expect(url).toBe('/api/conversations/3/messages')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    expect(JSON.parse(init.body as string)).toEqual({ content: 'next?' })
  })

  it('reassembles frames whose bytes are split mid multi-byte character across chunks', async () => {
    const frames = [
      { type: 'tool_status', status: 'searching', label: 'Searching your library…' },
      { type: 'tool_status', status: 'done', summary: 'Searched your library · 3 books' },
    ]
    const wholeText = frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join('')
    // '…' (U+2026) and '·' (U+00B7) both encode to more than one UTF-8 byte, so a split
    // landing inside either one only reassembles correctly if the decoder is fed with
    // `{ stream: true }` and the frame buffer waits for the full `\n\n` boundary.
    const ellipsisByte =
      new TextEncoder().encode(wholeText.slice(0, wholeText.indexOf('…'))).length + 1
    const middleDotByte =
      new TextEncoder().encode(wholeText.slice(0, wholeText.indexOf('·'))).length + 1
    fetchMock.mockResolvedValue(
      new Response(chunkedSseBody(frames, [ellipsisByte, middleDotByte]), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    )

    const service = new HttpLibrarianService()
    const events = await drain(service.sendMessage(3, 'next?'))

    expect(events).toEqual(frames)
  })

  it('throws an ApiError carrying the server detail when the send fails', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Conversation not found' }), { status: 404 })
    )

    const service = new HttpLibrarianService()
    const error = await drain(service.sendMessage(3, 'next?')).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 404, message: 'Conversation not found' })
  })

  it('reports a network failure fetching the conversation as ApiError(0), not a thrown TypeError', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    const service = new HttpLibrarianService()
    const error: unknown = await service.getConversation().catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 0, message: 'Could not reach the server.' })
  })

  it('reports a network failure sending a message as ApiError(0), not a thrown TypeError', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    const service = new HttpLibrarianService()
    const error = await drain(service.sendMessage(3, 'next?')).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 0, message: 'Could not reach the server.' })
  })
})
