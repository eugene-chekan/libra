import { useState } from 'react'

import { messageFor } from '../api/errors'
import { ErrorBlock } from './ErrorBlock'
import { Modal, ModalFooter } from './Modal'
import styles from './KindleEmailModal.module.css'

interface KindleEmailModalProps {
  /** `kindle_email` off the signed-in user. */
  currentEmail: string | null
  /** Called with the new value on Save — `null` when the field was cleared. */
  onSave: (email: string | null) => Promise<void>
  onClose: () => void
}

/** One `@`, text on both sides, and a dot in the part after it: enough to catch a typo. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** The one sentence to show, or null when the address is fit to save. An empty box clears it. */
export function checkKindleEmail(email: string): string | null {
  const trimmed = email.trim()
  if (trimmed === '' || EMAIL_SHAPE.test(trimmed)) return null
  return 'That is not an e-mail address. A Kindle address looks like name_a1b2c3@kindle.com.'
}

/** `client-design.md`'s Kindle Email modal. */
export function KindleEmailModal({ currentEmail, onSave, onClose }: KindleEmailModalProps) {
  const [email, setEmail] = useState(currentEmail ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    const problem = checkKindleEmail(email)
    if (problem) {
      setError(problem)
      return
    }

    setSaving(true)
    setError(null)
    try {
      await onSave(email.trim() === '' ? null : email.trim())
    } catch (caught) {
      setError(messageFor(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Kindle Email" width={400} onClose={onClose}>
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
          aria-invalid={error !== null}
        />
        <p className={styles.helper}>
          Add libra&apos;s sender address to your Approved Personal Document E-mail list, or Amazon
          will reject the delivery.
        </p>
        {error && <ErrorBlock message={error} />}
      </div>

      <ModalFooter className={styles.footer}>
        <button type="button" className={styles.cancel} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={styles.save} onClick={handleSave} disabled={saving}>
          Save
        </button>
      </ModalFooter>
    </Modal>
  )
}
