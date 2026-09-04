import { Icon } from '../widgets/Icon'
import styles from './PageArrows.module.css'

interface PageArrowsProps {
  atStart: boolean
  atEnd: boolean
  onPrevious: () => void
  onNext: () => void
}

/** The two page turns, sitting either side of the text. */
export function PageArrows({ atStart, atEnd, onPrevious, onNext }: PageArrowsProps) {
  return (
    <>
      <button
        type="button"
        className={`${styles.arrow} ${styles.previous}`}
        aria-label="Previous page"
        disabled={atStart}

        onClick={onPrevious}
      >
        <Icon name="chevron-left" size={22} />
      </button>
      <button
        type="button"
        className={`${styles.arrow} ${styles.next}`}
        aria-label="Next page"
        disabled={atEnd}

        onClick={onNext}
      >
        <Icon name="chevron-right" size={22} />
      </button>
    </>
  )
}
