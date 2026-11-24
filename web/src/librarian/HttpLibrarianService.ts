import { networkFailure, responseFailure } from '../api/errors'
import type { Conversation } from '../api/types'
import type { LibrarianEvent, LibrarianService } from './LibrarianService'

const BASE = '/api'

/** The real client: fetches the conversation, and parses the librarian's SSE reply stream by hand, since `EventSource` cannot POST a body. */
export class HttpLibrarianService implements LibrarianService {
  async getConversation(): Promise<Conversation> {
    const path = `${BASE}/conversations/mine`
    const response = await this.fetch(path, { credentials: 'include' })
    if (!response.ok) throw await responseFailure(`GET ${path}`, response)
    return (await response.json()) as Conversation
  }

  async *sendMessage(conversationId: number, content: string): AsyncGenerator<LibrarianEvent> {
    const path = `${BASE}/conversations/${conversationId}/messages`
    const response = await this.fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    if (!response.ok || !response.body) {
      throw await responseFailure(`POST ${path}`, response)
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

  /** `fetch`, with a network failure turned into the same error `HttpLibraApi` throws. */
  private async fetch(path: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(path, init)
    } catch {
      throw networkFailure(`${init.method ?? 'GET'} ${path}`)
    }
  }
}
