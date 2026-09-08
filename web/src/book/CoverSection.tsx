import { useState } from 'react'

import { messageFor } from '../api/errors'
import type { Book } from '../api/types'
import { Icon } from '../widgets/Icon'
import { useClearCover, useSetCover, useSetCoverFromUrl } from './useCover'
import buttons from './actionButtons.module.css'
import styles from './CoverSection.module.css'

/** The cover, inside the Edit Book form — the one part of it that applies at once. */
export function CoverSection({ book }: { book: Book }) {
  const setCover = useSetCover(book.id)
  const setFromUrl = useSetCoverFromUrl(book.id)
  const clear = useClearCover(book.id)
  const [link, setLink] = useState('')
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null)

  const busy = setCover.isPending || setFromUrl.isPending || clear.isPending

  function settled(done: string) {
    return {
      onSuccess: () => setSaid({ ok: true, text: done }),
      onError: (err: Error) => setSaid({ ok: false, text: messageFor(err) }),
    }
  }

  return (
    <section className={styles.section}>
      <h3 className={styles.heading}>Cover</h3>
      {/* The fields above this one wait for Save. This one cannot: a picture
          goes to its own endpoint and cannot ride along in that one write. */}
      <p className={styles.hint}>
        A cover applies straight away, unlike the fields above. Use the book’s own cover again to
        undo it.
      </p>

      <label className={styles.field}>
        Choose a picture
        <input
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) setCover.mutate(file, settled('Cover updated.'))
          }}
        />
      </label>

      <label className={styles.field}>
        Or paste a link
        <input
          type="url"
          value={link}
          placeholder="https://…"
          disabled={busy}
          onChange={(event) => setLink(event.target.value)}
          onKeyDown={(event) => {
            // Enter here would otherwise submit the Edit Book form and drop the link.
            if (event.key !== 'Enter') return
            event.preventDefault()
            if (link.trim() && !busy) setFromUrl.mutate(link.trim(), settled('Cover updated.'))
          }}
        />
      </label>
      <button
        type="button"
        className={`${buttons.outlined} ${buttons.small}`}
        disabled={busy || !link.trim()}
        onClick={() => setFromUrl.mutate(link.trim(), settled('Cover updated.'))}
      >
        Use this link
      </button>

      <button
        type="button"
        className={`${buttons.outlined} ${buttons.small}`}
        disabled={busy}
        onClick={() => clear.mutate(undefined, settled('Using the book’s own cover again.'))}
      >
        Use the book’s own cover again
      </button>

      {said && (
        <p className={said.ok ? styles.succeeded : styles.failed} role="status">
          <Icon name={said.ok ? 'check' : 'x'} size={14} />
          {said.text}
        </p>
      )}
    </section>
  )
}
