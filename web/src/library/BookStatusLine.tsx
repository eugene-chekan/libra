import { Icon } from '../widgets/Icon'
import styles from './BookStatusLine.module.css'

interface BookStatusLineProps {
  /** 0 to 1. */
  progress: number
  /** 0 to 5. Read-only — set from the book detail screen, not here. */
  rating: number
}

/**
 * The library card's one status line, in the three states client-design.md
 * names: unstarted, partway through, or finished. Never more than one shows
 * at once — a book cannot be both 40% read and rated, because a rating
 * belongs to a book the reader has finished.
 */
export function BookStatusLine({ progress, rating }: BookStatusLineProps) {
  if (progress >= 1) {
    return (
      <div className={styles.stars} role="img" aria-label={`${rating} out of 5 stars`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Icon
            key={n}
            name="star"
            size={12}
            className={n <= rating ? styles.starFilled : styles.starEmpty}
          />
        ))}
      </div>
    )
  }

  if (progress > 0) {
    const pct = Math.round(progress * 100)
    return (
      <div className={styles.progressRow}>
        <div
          className={styles.track}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className={styles.fill} style={{ width: `${pct}%` }} />
        </div>
        <span className={styles.percent}>{pct}%</span>
      </div>
    )
  }

  return <span className={styles.notStarted}>Not started</span>
}
