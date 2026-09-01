import { ApiError } from '../api/errors'
import type { Conversation, LibrarianMessage } from '../api/types'
import type { LibrarianEvent, LibrarianService } from './LibrarianService'

export interface FakeBook {
  id: number
  title: string
}

const NOTHING_FOUND = "I couldn't find anything in your library about that."

interface ScriptedReply {
  text: string
  /** Whether `text` actually points at `book`, and so should carry a citation. */
  citable: boolean
}

function scriptFor(lowered: string, book: FakeBook | undefined): ScriptedReply {
  if (lowered.includes('not-indexed-test')) {
    return {
      text: "I don't have that book indexed yet, so I can't answer questions about its contents.",
      citable: false,
    }
  }
  if (!book) return { text: NOTHING_FOUND, citable: false }
  if (lowered.includes('next')) {
    return {
      text: `Based on what's in your library, ${book.title} looks like a good next read.`,
      citable: true,
    }
  }
  if (lowered.includes('theme')) {
    return {
      text: `${book.title} explores several themes worth pulling on — ask me about any of them.`,
      citable: true,
    }
  }
  if (lowered.includes('like') || lowered.includes('similar')) {
    return {
      text: `${book.title} is the closest match in your library to what you described.`,
      citable: true,
    }
  }
  return { text: NOTHING_FOUND, citable: false }
}

/** Canned exchanges, mirroring `app/librarian.py`'s scripts exactly. */
export class FakeLibrarianService implements LibrarianService {
  private nextId = 1
  private readonly messages: LibrarianMessage[] = []
  private readonly books: FakeBook[]

  constructor({ books = [] }: { books?: FakeBook[] } = {}) {
    this.books = books
  }

  async getConversation(): Promise<Conversation> {
    return { id: 1, messages: this.messages }
  }

  async *sendMessage(_conversationId: number, content: string): AsyncGenerator<LibrarianEvent> {
    this.messages.push({
      id: this.nextId++,
      role: 'user',
      content,
      created_at: new Date(0).toISOString(),
      meta: {},
    })

    if (content.toLowerCase().includes('make the librarian unavailable')) {
      throw new ApiError(0, 'Could not reach the server.')
    }

    const book = this.books[0]
    const { text, citable } = scriptFor(content.toLowerCase(), book)
    const citation = citable && book ? { book_id: book.id, title: book.title } : null

    yield { type: 'tool_status', status: 'searching', label: 'Searching your library…' }
    const summary = `Searched your library · ${this.books.length} book${this.books.length === 1 ? '' : 's'}`
    yield { type: 'tool_status', status: 'done', summary }

    for (const piece of text.split(' ')) {
      yield { type: 'token', text: `${piece} ` }
    }
    if (citation) yield { type: 'citation', ...citation }

    const reply: LibrarianMessage = {
      id: this.nextId++,
      role: 'librarian',
      content: text,
      created_at: new Date(0).toISOString(),
      meta: { ...(citation ? { citation } : {}), tool_call: { summary } },
    }
    this.messages.push(reply)
    yield { type: 'done', message_id: reply.id }
  }
}
