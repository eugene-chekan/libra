import { Icon } from '../widgets/Icon'
import type { Pages } from './pages'
import styles from './ReturnToPlace.module.css'

interface ReturnToPlaceProps {
  /** Where the page the link left sits in the book, or null while the book is not measured. */
  pages: Pages | null
  onReturn: () => void
  /** Closes the way back, keeping the page on screen as the reading place. */
  onStay: () => void
}

/** The way back to the page a link inside the book left. */
export function ReturnToPlace({ pages, onReturn, onStay }: ReturnToPlaceProps) {
  return (
    <div className={styles.bar}>
      <button type="button" className={styles.back} onClick={onReturn}>
        <Icon name="chevron-left" size={16} />
        {pages === null ? 'Back to where you were' : `Back to page ${pages.current}`}
      </button>
      <button type="button" className={styles.stay} aria-label="Stay here" onClick={onStay}>
        <Icon name="x" size={14} />
      </button>
    </div>
  )
}
