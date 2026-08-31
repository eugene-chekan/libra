import { createContext, useContext, useState, type ReactNode } from 'react'

import type { Citation, LibrarianMessage } from '../api/types'
import type { LibrarianEvent } from './LibrarianService'
import { useLibrarianService } from './LibrarianServiceContext'

interface StreamingState {
  toolStatus: LibrarianEvent | null
  text: string
  citation: Citation | null
}

interface Librarian {
  isOpen: boolean
  open: () => void
  close: () => void
  messages: LibrarianMessage[]
  streaming: StreamingState | null
  isSending: boolean
  sendError: Error | null
  send: (text: string) => void
}

const LibrarianContext = createContext<Librarian | null>(null)

/** Opening the panel, and streaming a reply into it. */
export function LibrarianProvider({ children }: { children: ReactNode }) {
  const service = useLibrarianService()
  const [isOpen, setIsOpen] = useState(false)
  const [conversationId, setConversationId] = useState<number | null>(null)
  const [messages, setMessages] = useState<LibrarianMessage[]>([])
  const [streaming, setStreaming] = useState<StreamingState | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [sendError, setSendError] = useState<Error | null>(null)

  async function ensureConversation(): Promise<number> {
    if (conversationId !== null) return conversationId
    const conversation = await service.getConversation()
    setConversationId(conversation.id)
    setMessages(conversation.messages)
    return conversation.id
  }

  function open() {
    setIsOpen(true)
    void ensureConversation()
  }

  function close() {
    setIsOpen(false)
  }

  function send(text: string) {
    setIsSending(true)
    setSendError(null)
    setStreaming({ toolStatus: null, text: '', citation: null })

    void (async () => {
      try {
        const id = await ensureConversation()
        for await (const event of service.sendMessage(id, text)) {
          if (event.type === 'tool_status') {
            setStreaming((s) => s && { ...s, toolStatus: event })
          } else if (event.type === 'token') {
            setStreaming((s) => s && { ...s, text: s.text + event.text })
          } else if (event.type === 'citation') {
            setStreaming(
              (s) => s && { ...s, citation: { book_id: event.book_id, title: event.title } }
            )
          } else if (event.type === 'done') {
            const conversation = await service.getConversation()
            setMessages(conversation.messages)
          }
        }
      } catch (err) {
        setSendError(err instanceof Error ? err : new Error('Something went wrong.'))
      } finally {
        setIsSending(false)
        setStreaming(null)
      }
    })()
  }

  return (
    <LibrarianContext
      value={{ isOpen, open, close, messages, streaming, isSending, sendError, send }}
    >
      {children}
    </LibrarianContext>
  )
}

/** The librarian panel's open state and its conversation. */
export function useLibrarian(): Librarian {
  const librarian = useContext(LibrarianContext)
  if (!librarian) throw new Error('useLibrarian must be used inside a LibrarianProvider')
  return librarian
}
