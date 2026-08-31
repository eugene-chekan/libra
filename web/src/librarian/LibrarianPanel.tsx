import * as Dialog from '@radix-ui/react-dialog'
import { useState, type FormEvent, type KeyboardEvent } from 'react'

import { useBooks } from '../library/useBooks'
import { Icon } from '../widgets/Icon'
import { useLibrarian } from './LibrarianProvider'
import styles from './LibrarianPanel.module.css'
import { MessageBubble, StreamingBubble } from './MessageBubble'

/** The librarian, as a panel over whatever page is open — not its own route. */
export function LibrarianPanel() {
  const { isOpen, close, messages, streaming, isSending, sendError, send } = useLibrarian()
  const [draft, setDraft] = useState('')
  const books = useBooks({ sort: 'title' })
  const firstBook = books.data?.items[0]

  function submit(event?: FormEvent) {
    event?.preventDefault()
    const text = draft.trim()
    if (!text || isSending) return
    send(text)
    setDraft('')
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && close()}>
      {isOpen && (
        <Dialog.Portal>
          <Dialog.Overlay className={styles.overlay} />
          <Dialog.Content className={styles.content}>
            <div className={styles.header}>
              <Dialog.Title className={styles.title}>Librarian</Dialog.Title>
              <span className={styles.badge}>NOT CONNECTED</span>
            </div>
            <div className={styles.stubLine}>
              The librarian isn't connected yet — replies below are canned examples.
            </div>

            <div className={styles.messages}>
              {messages.length === 0 && !streaming && (
                <EmptyState firstBookTitle={firstBook?.title} onPick={(text) => send(text)} />
              )}
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {streaming && (
                <StreamingBubble
                  toolStatusLabel={
                    streaming.toolStatus?.type === 'tool_status' &&
                    streaming.toolStatus.status === 'searching'
                      ? streaming.toolStatus.label
                      : null
                  }
                  text={streaming.text}
                />
              )}
              {sendError && (
                <div className={styles.errorCard} role="alert">
                  <div className={styles.errorText}>The librarian is unavailable right now.</div>
                  <button type="button" className={styles.retry} onClick={() => submit()}>
                    <Icon name="rotate-cw" size={12} />
                    Try again
                  </button>
                </div>
              )}
            </div>

            <div className={styles.composerWrap}>
              <form className={styles.composer} onSubmit={submit}>
                <textarea
                  className={styles.textarea}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Ask about your library…"
                  aria-label="Ask about your library"
                />
                <button
                  type="submit"
                  className={styles.send}
                  disabled={!draft.trim() || isSending}
                  aria-label="Send"
                >
                  <Icon name="send" size={16} />
                </button>
              </form>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      )}
    </Dialog.Root>
  )
}

function EmptyState({
  firstBookTitle,
  onPick,
}: {
  firstBookTitle: string | undefined
  onPick: (text: string) => void
}) {
  const suggestions = [
    'What should I read next?',
    ...(firstBookTitle
      ? [
          `What are the main themes in ${firstBookTitle}?`,
          `Find me something like ${firstBookTitle}.`,
        ]
      : []),
  ]

  return (
    <div className={styles.empty}>
      <div className={styles.emptyTitle}>Ask about your library</div>
      {suggestions.map((text) => (
        <button key={text} type="button" className={styles.suggestion} onClick={() => onPick(text)}>
          {text}
        </button>
      ))}
    </div>
  )
}
