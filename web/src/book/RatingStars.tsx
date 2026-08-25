import { useState } from 'react'

import { Icon } from '../widgets/Icon'
import styles from './RatingStars.module.css'

interface RatingStarsProps {
  /** 0 to 5. */
  rating: number
  /** Called with the new rating. */
  onRate: (rating: number) => void
  /** Pixel size of one star. */
  size?: number
}

const STARS = [1, 2, 3, 4, 5]

/** The rating, which writes the moment it is clicked. */
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
