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
  /**
   * Whether this reader may edit the shared catalog. `PATCH /books/{id}` is
   * admin-only, so a reader without it is shown no Edit Book button rather
   * than a form whose Save is certain to be refused.
   */
  canEdit: boolean
  hasKindleAddress: boolean
  onEdit: () => void
  onMoveToShelf: (shelfId: number | null) => void
  onSendToKindle: () => Promise<unknown>
  onSetUpKindle: () => void
}

/**
 * The action row — two rows, split on meaning.
 *
 * The design drew three buttons. There are five, and they do not fit one row
 * at 1024px. Rather than letting them wrap into whatever shape the viewport
 * dictates, they split where the meaning already divides: **what you do with
 * the book**, then **how you file it**. That reads as a decision rather than a
 * reflow, and it is what makes the screen survive its minimum width.
 *
 * The three-state label belongs to the Read button, not to Download. It was
 * very nearly attached to Download, which would have been a small lie — a
 * reader clicking "Start Reading" and finding a file in their downloads
 * folder. It is also the reason the reader (#36) exists at all.
 *
 * The API is read here rather than handed down: this is the only thing on the
 * screen that needs the download address.
 */
export function BookActions({
  book,
  shelves,
  canEdit,
  hasKindleAddress,
  onEdit,
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
