import { Link } from 'react-router-dom'

import { useApi } from '../api/ApiProvider'
import type { Book, Shelf } from '../api/types'
import { readerPath } from '../routes'
import { Icon } from '../widgets/Icon'
import { KindleButton } from './KindleButton'
import { MoveToShelfButton } from './MoveToShelfButton'
import buttons from './actionButtons.module.css'
import styles from './BookActions.module.css'

interface BookActionsProps {
  book: Book
  shelves: Shelf[]
  /** Whether this reader may edit the shared catalog. Deleting takes the same admin rights. */
  canEdit: boolean
  hasKindleAddress: boolean
  onEdit: () => void
  onDelete: () => void
  onMoveToShelf: (shelfId: number | null) => void
  onSendToKindle: () => Promise<unknown>
  onSetUpKindle: () => void
}

/** The action row — two rows, split on meaning. */
export function BookActions({
  book,
  shelves,
  canEdit,
  hasKindleAddress,
  onEdit,
  onDelete,
  onMoveToShelf,
  onSendToKindle,
  onSetUpKindle,
}: BookActionsProps) {
  const api = useApi()

  return (
    <div className={styles.rows}>
      <div className={styles.row}>
        <Link className={buttons.primary} to={readerPath(book.id)}>
          {primaryLabel(book.progress)}
        </Link>

        {/* An anchor, not a fetch: the browser is better at saving a file than
            any code here would be, and the session cookie rides along because
            the API and the page share an origin. The offered filename is the
            server's business — it rebuilds one from the catalog rather than
            echoing whatever the uploader called the file. */}
        <a className={buttons.outlined} href={api.fileUrl(book.id)} download>
          <Icon name="download" size={14} />
          Download
        </a>

        <KindleButton
          hasAddress={hasKindleAddress}
          lastSentAt={book.last_sent_at}
          onSend={onSendToKindle}
          onSetUpAddress={onSetUpKindle}
        />
      </div>

      <div className={styles.row}>
        {canEdit && (
          <button type="button" className={`${buttons.outlined} ${buttons.small}`} onClick={onEdit}>
            Edit Book
          </button>
        )}
        <MoveToShelfButton
          shelves={shelves}
          currentShelfId={book.shelf_id}
          onSelect={onMoveToShelf}
        />
        {canEdit && (
          <button
            type="button"
            className={`${buttons.outlined} ${buttons.small} ${buttons.destructive}`}
            onClick={onDelete}
          >
            <Icon name="trash" size={14} />
            Delete Book
          </button>
        )}
      </div>
    </div>
  )
}

/** What the button offers depends on where the reader already is. */
function primaryLabel(progress: number): string {
  if (progress <= 0) return 'Start Reading'
  if (progress >= 1) return 'Read Again'
  return 'Continue Reading'
}
