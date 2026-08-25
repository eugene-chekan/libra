import { useState } from 'react'

import { useApi } from '../api/ApiProvider'
import { coverGradient } from './coverPalette'
import styles from './BookCover.module.css'

interface BookCoverProps {
  id: number
  title: string
  hasCover: boolean
  /** Called when the image the server promised does not load. */
  onError?: () => void
}

/** A book's cover, or the procedural gradient standing in for one. */
export function BookCover({ id, title, hasCover, onError }: BookCoverProps) {
  const api = useApi()
  const [broken, setBroken] = useState(false)

  if (hasCover && !broken) {
    return (
      <img
        className={styles.cover}
        src={api.coverUrl(id)}
        alt={title}
        onError={() => {
          setBroken(true)
          onError?.()
        }}
      />
    )
  }

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
