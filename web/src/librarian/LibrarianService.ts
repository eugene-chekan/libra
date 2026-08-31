import type { Citation, Conversation } from '../api/types'

export type LibrarianEvent =
  | { type: 'tool_status'; status: 'searching'; label: string }
  | { type: 'tool_status'; status: 'done'; summary: string }
  | { type: 'token'; text: string }
  | ({ type: 'citation' } & Citation)
  | { type: 'done'; message_id: number }

/** Fetching and adding to the reader's one implicit conversation. */
export interface LibrarianService {
  getConversation(): Promise<Conversation>
  sendMessage(conversationId: number, content: string): AsyncIterable<LibrarianEvent>
}
