import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'

import { useApi } from '../api/ApiProvider'
import type { Book } from '../api/types'
import { BookCover } from '../library/BookCover'
import hidden from '../widgets/visuallyHidden.module.css'
import styles from './DetailCover.module.css'

/** The detail screen's cover, and the lightbox behind it. */
export function DetailCover({ book }: { book: Book }) {
  const api = useApi()
  const version = book.cover_version
  // The version whose picture did not load. A new version is a new picture, and gets a new try.
  const [failedVersion, setFailedVersion] = useState<string | null>(null)

  const cover = (
    <BookCover
      id={book.id}
      title={book.title}
      coverVersion={version}
      onError={() => setFailedVersion(version)}
    />
  )

  if (version === null || version === failedVersion) {
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
          <Dialog.Title className={hidden.visuallyHidden}>Cover of {book.title}</Dialog.Title>
          <img
            className={styles.full}
            src={api.coverUrl(book.id, version)}
            alt={`Cover of ${book.title}`}
          />
          <Dialog.Close className={styles.close} aria-label="Close">
            &times;
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
