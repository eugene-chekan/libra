import { ApiError, readDetail } from '../api/errors'
import type { Conversation } from '../api/types'
import type { LibrarianEvent, LibrarianService } from './LibrarianService'

const BASE = '/api'

/** The real client: fetches the conversation, and parses the librarian's SSE reply stream by hand, since `EventSource` cannot POST a body. */
export class HttpLibrarianService implements LibrarianService {
  async getConversation(): Promise<Conversation> {
    const response = await this.fetch(`${BASE}/conversations/mine`, { credentials: 'include' })
    if (!response.ok) throw new ApiError(response.status, await readDetail(response))
    return (await response.json()) as Conversation
  }

  async *sendMessage(conversationId: number, content: string): AsyncGenerator<LibrarianEvent> {
    const response = await this.fetch(`${BASE}/conversations/${conversationId}/messages`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    if (!response.ok || !response.body) {
      throw new ApiError(response.status, await readDetail(response))
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const frames = buffer.split('\n\n')
      buffer = frames.pop() ?? ''
      for (const frame of frames) {
        const line = frame.trim()
        if (!line.startsWith('data: ')) continue
        yield JSON.parse(line.slice('data: '.length)) as LibrarianEvent
      }
    }
  }

  /** `fetch`, with a network failure turned into the same `ApiError(0, ...)` `HttpLibraApi` throws. */
  private async fetch(path: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(path, init)
    } catch {
      throw new ApiError(0, 'Could not reach the server.')
    }
  }
}
