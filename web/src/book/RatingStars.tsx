import { useState } from 'react'

import { Icon } from '../widgets/Icon'
import styles from './RatingStars.module.css'

interface RatingStarsProps {
  /** 0 to 5. 0 means unrated. */
  rating: number
  /** Called with the new rating. 0 clears it. */
  onRate: (rating: number) => void
  /** Pixel size of one star. */
  size?: number
}

const STARS = [1, 2, 3, 4, 5]

/**
 * The rating, which writes the moment it is clicked.
 *
 * A rating is the reader's own state and nobody else's, so there is nothing to
 * agree with anyone about, and no reason to make somebody open a form and
 * press Save to say they liked a book.
 *
 * **Clicking the star you already gave clears the rating.** Without that, four
 * stars is a decision that cannot be taken back — there is no other control
 * for "actually, no opinion".
 *
 * Hovering previews what a click would set, and only the drawing follows it:
 * `aria-pressed` stays on the real rating, because a screen reader should be
 * told what is true rather than what the mouse is over.
 */
export function RatingStars({ rating, onRate, size = 20 }: RatingStarsProps) {
  const [hovered, setHovered] = useState<number | null>(null)

  const shown = hovered ?? rating

  return (
    <div className={styles.stars} role="group" aria-label="Your rating">
      {STARS.map((star) => (
        <button
          key={star}
          type="button"
          className={styles.star}
          aria-label={star === rating ? 'Clear rating' : `Rate ${star} out of 5`}
          aria-pressed={star <= rating}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(null)}
          onFocus={() => setHovered(star)}
          onBlur={() => setHovered(null)}
          onClick={() => onRate(star === rating ? 0 : star)}
        >
          <Icon name="star" size={size} className={star <= shown ? styles.on : styles.off} />
        </button>
      ))}
    </div>
  )
}
