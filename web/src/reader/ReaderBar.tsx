import { Link } from 'react-router-dom'

import { useLibrarian } from '../librarian/LibrarianProvider'
import { Icon } from '../widgets/Icon'
import styles from './ReaderBar.module.css'

interface ReaderBarProps {
  title: string
  /** The chapter on screen, or null when the book lists none. */
  chapter: string | null
  /** 0 to 1, or null while the book has not been measured. */
  progress: number | null
  backTo: string
  onContents: () => void
  onAppearance: () => void
}

/** The reader's only chrome: always visible, and carrying the progress rule. */
export function ReaderBar({
  title,
  chapter,
  progress,
  backTo,
  onContents,
  onAppearance,
}: ReaderBarProps) {
  const { open: openLibrarian } = useLibrarian()
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
      {percent !== null && <span className={styles.percent}>{percent}%</span>}
      <div className={styles.controls}>
        <button type="button" className={styles.control} aria-label="Contents" onClick={onContents}>
          <Icon name="list" size={18} />
        </button>
        <button
          type="button"
          className={styles.control}
          aria-label="Text size and width"
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
