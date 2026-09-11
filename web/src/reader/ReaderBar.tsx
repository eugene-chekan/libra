import { Link } from 'react-router-dom'

import { useLibrarian } from '../librarian/LibrarianProvider'
import { useIsPhone } from '../shell/useIsPhone'
import { Icon } from '../widgets/Icon'
import type { Pages } from './pages'
import styles from './ReaderBar.module.css'

interface ReaderBarProps {
  title: string
  /** The chapter on screen, or null when the book lists none. */
  chapter: string | null
  /** Estimated printed pages, or null until the book has been measured. */
  pages: Pages | null
  /** 0 to 1, or null while the book has not been measured. */
  progress: number | null
  backTo: string
  onContents: () => void
  onAppearance: () => void
  /**
   * The page turns, when they belong here rather than beside the text — which is a phone,
   * where there is no room in the margin for them. Null on a wider window.
   */
  pageTurns: PageTurns | null
}

/** What the bar needs to turn a page, when it is the one holding those controls. */
export interface PageTurns {
  atStart: boolean
  atEnd: boolean
  onPrevious: () => void
  onNext: () => void
}

/** The reader's only chrome: always visible, and carrying the progress rule. */
export function ReaderBar({
  title,
  chapter,
  pages,
  progress,
  backTo,
  onContents,
  onAppearance,
  pageTurns,
}: ReaderBarProps) {
  const { open: openLibrarian } = useLibrarian()
  const isPhone = useIsPhone()
  // Measuring a book takes a second or two. A number nobody knows yet is left blank rather
  // than guessed at.
  const percent = progress === null ? null : Math.round(progress * 100)

  return (
    <header className={styles.bar}>
      <Link className={styles.back} to={backTo}>
        <Icon name="chevron-left" size={16} />
        Back
      </Link>
      <span className={styles.title}>{title}</span>
      {chapter !== null && <span className={styles.chapter}>· {chapter}</span>}
      {pages !== null && (
        <span className={styles.pages}>
          p. {pages.current} of {pages.total}
        </span>
      )}
      {percent !== null && <span className={styles.percent}>{percent}%</span>}
      <div className={styles.controls}>
        {pageTurns && (
          <>
            <button
              type="button"
              className={styles.control}
              aria-label="Previous page"
              disabled={pageTurns.atStart}
              onClick={pageTurns.onPrevious}
            >
              <Icon name="chevron-left" size={18} />
            </button>
            <button
              type="button"
              className={styles.control}
              aria-label="Next page"
              disabled={pageTurns.atEnd}
              onClick={pageTurns.onNext}
            >
              <Icon name="chevron-right" size={18} />
            </button>
          </>
        )}
        <button type="button" className={styles.control} aria-label="Contents" onClick={onContents}>
          <Icon name="list" size={18} />
        </button>
        <button
          type="button"
          className={styles.control}
          // On a phone the menu has no width choice, so the name leaves it out.
          aria-label={isPhone ? 'Text size' : 'Text size and width'}
          onClick={onAppearance}
        >
          <Icon name="type" size={18} />
        </button>
        <button
          type="button"
          className={styles.control}
          aria-label="Ask the librarian"
          onClick={openLibrarian}
        >
          <Icon name="message-square" size={18} />
        </button>
      </div>
      {percent !== null && (
        <div
          className={styles.progress}
          style={{ width: `${percent}%` }}
          role="progressbar"
          aria-label="Reading progress"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      )}
    </header>
  )
}
