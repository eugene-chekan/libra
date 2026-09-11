import { useState } from 'react'

import { useApi } from '../api/ApiProvider'
import { coverGradient } from './coverPalette'
import styles from './BookCover.module.css'

interface BookCoverProps {
  id: number
  title: string
  /** The book's `cover_version`, or null when it has no cover. */
  coverVersion: string | null
  /** Called when the image the server promised does not load. */
  onError?: () => void
}

/** A book's cover, or the procedural gradient standing in for one. */
export function BookCover({ id, title, coverVersion, onError }: BookCoverProps) {
  const api = useApi()
  const src = coverVersion === null ? null : api.coverUrl(id, coverVersion)
  // A failure is remembered for one address only, so a new cover is still tried after an old
  // one failed to load.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  if (src !== null && src !== failedSrc) {
    return (
      <img
        className={styles.cover}
        src={src}
        alt={title}
        onError={() => {
          setFailedSrc(src)
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
