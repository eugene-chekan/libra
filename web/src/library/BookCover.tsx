import { useState } from 'react'

import { useApi } from '../api/ApiProvider'
import { coverGradient } from './coverPalette'
import styles from './BookCover.module.css'

interface BookCoverProps {
  id: number
  title: string
  hasCover: boolean
}

/**
 * A book's cover, or the procedural gradient standing in for one.
 *
 * `hasCover` decides which to try first, but it is the server's belief at
 * catalog-read time, not a guarantee — a file can change between the two.
 * `onError` on the `<img>` is what makes an unexpected 404 fall back the same
 * way a known one does, rather than showing a broken-image icon.
 */
export function BookCover({ id, title, hasCover }: BookCoverProps) {
  const api = useApi()
  const [broken, setBroken] = useState(false)

  if (hasCover && !broken) {
    return (
      <img
        className={styles.cover}
        src={api.coverUrl(id)}
        alt={title}
        onError={() => setBroken(true)}
      />
    )
  }

  // aria-hidden: the title drawn here is decoration. BookCard prints the
  // same title as real text beneath the cover, which is what a screen
  // reader should announce once, not twice.
  return (
    <div className={styles.cover} style={{ background: coverGradient(id) }} aria-hidden="true">
      <span className={styles.spine} />
      <span className={styles.ruleTop} />
      <span className={styles.ruleBottom} />
      <span className={styles.titleWrap}>
        <span className={styles.title}>{title}</span>
      </span>
    </div>
  )
}
