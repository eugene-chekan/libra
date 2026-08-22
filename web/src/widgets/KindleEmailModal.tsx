import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'

import styles from './KindleEmailModal.module.css'

interface KindleEmailModalProps {
  /** `kindle_email` off the signed-in user. `null` when none is set yet. */
  currentEmail: string | null
  /** Called with the new value on Save — `null` when the field was cleared. */
  onSave: (email: string | null) => Promise<void>
  onClose: () => void
}

/**
 * `client-design.md`'s Kindle Email modal. Writes `PATCH /api/users/{self}`
 * through whichever caller owns the session — this component only asks for
 * the value and hands it back, so it does not need to know about `LibraApi`
 * or the signed-in user beyond the one field it edits.
 *
 * The helper line under the field is not decoration. Amazon rejects mail from
 * a sender that is not on the reader's own Approved Personal Document E-mail
 * list, which is the single most common reason a delivery silently fails —
 * learned the hard way during Phase 1.
 */
export function KindleEmailModal({ currentEmail, onSave, onClose }: KindleEmailModalProps) {
  const [email, setEmail] = useState(currentEmail ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(email.trim() === '' ? null : email.trim())
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <Dialog.Title className={styles.title}>Kindle Email</Dialog.Title>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="kindle-email">
              Send-to-Kindle address
            </label>
            <input
              id="kindle-email"
              className={styles.input}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you_a1b2c3@kindle.com"
            />
            <p className={styles.helper}>
              Add libra&apos;s sender address to your Approved Personal Document E-mail list, or
              Amazon will reject the delivery.
            </p>
          </div>

          <div className={styles.footer}>
            <button type="button" className={styles.cancel} onClick={onClose}>
              Cancel
            </button>
            <button type="button" className={styles.save} onClick={handleSave} disabled={saving}>
              Save
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
