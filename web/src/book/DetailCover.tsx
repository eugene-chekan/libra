import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'

import { useApi } from '../api/ApiProvider'
import type { Book } from '../api/types'
import { BookCover } from '../library/BookCover'
import styles from './DetailCover.module.css'

/** The detail screen's cover, and the lightbox behind it. */
export function DetailCover({ book }: { book: Book }) {
  const api = useApi()
  const [broken, setBroken] = useState(false)
  const enlargeable = book.has_cover && !broken

  const cover = (
    <BookCover
      id={book.id}
      title={book.title}
      hasCover={book.has_cover}
      onError={() => setBroken(true)}
    />
  )

  if (!enlargeable) {
    return <div className={styles.frame}>{cover}</div>
  }

  return (
    <Dialog.Root>
      <div className={styles.frame}>
        <Dialog.Trigger asChild>
          <button type="button" className={styles.trigger} aria-label="Enlarge cover">
            {cover}
          </button>
        </Dialog.Trigger>
      </div>

      <Dialog.Portal>
        {/* Radix closes on Escape and on a click outside, which is what a
            lightbox has to do — one that traps you is one nobody opens twice. */}
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.lightbox} aria-describedby={undefined}>
          <Dialog.Title className={styles.lightboxTitle}>Cover of {book.title}</Dialog.Title>
          <img className={styles.full} src={api.coverUrl(book.id)} alt={`Cover of ${book.title}`} />
          <Dialog.Close className={styles.close} aria-label="Close">
            &times;
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
