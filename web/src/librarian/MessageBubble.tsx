import { Link } from 'react-router-dom'

import type { LibrarianMessage } from '../api/types'
import { bookPath } from '../routes'
import { Icon } from '../widgets/Icon'
import styles from './MessageBubble.module.css'

/** One turn in the conversation: the reader's own, or the librarian's. */
export function MessageBubble({ message }: { message: LibrarianMessage }) {
  if (message.role === 'user') {
    return <div className={styles.reader}>{message.content}</div>
  }

  return (
    <div className={styles.librarian}>
      {message.meta.tool_call && (
        <div className={styles.toolStatus}>{message.meta.tool_call.summary}</div>
      )}
      <div className={styles.label}>Librarian</div>
      <div className={styles.body}>{message.content}</div>
      {message.meta.citation && (
        <Link
          to={bookPath(message.meta.citation.book_id)}
          className={styles.citation}
          aria-label={`Cited book: ${message.meta.citation.title}`}
        >
          <Icon name="book-open" size={12} />
          {message.meta.citation.title}
        </Link>
      )}
    </div>
  )
}

/** The reply still streaming in: a live tool-call status and a growing caret-terminated body. */
export function StreamingBubble({
  toolStatusLabel,
  text,
}: {
  toolStatusLabel: string | null
  text: string
}) {
  return (
    <div className={styles.librarian}>
      {toolStatusLabel && (
        <div className={styles.toolStatus}>
          <Icon name="search" size={14} />
          {toolStatusLabel}
        </div>
      )}
      <div className={styles.label}>Librarian</div>
      <div className={styles.body}>
        {text}
        <span className={styles.caret} />
      </div>
    </div>
  )
}
