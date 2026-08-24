import { Modal, ModalFooter } from './Modal'
import styles from './ConfirmDialog.module.css'

interface ConfirmDialogProps {
  /** A question, naming the thing. "Delete Reading Now?" */
  title: string
  /** What will happen, in full. This is the part a reader acts on. */
  message: string
  /** The verb on the button that goes ahead. "Delete", never "OK". */
  confirmLabel: string
  onConfirm: () => void
  onClose: () => void
}

/**
 * The application's one confirmation, for a step that cannot be undone.
 *
 * A real dialog, never the browser's own `confirm()` — the prototype used
 * that, and it cannot be styled, cannot be read by the same focus rules as
 * everything else, and gives no room for the sentence that matters.
 *
 * **The message says what survives**, not just what goes. "Are you sure?"
 * tells a reader nothing they did not already know; "the books stay in your
 * library" is the fact they are actually weighing.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Modal title={title} description={message} width={420} onClose={onClose}>
      <ModalFooter>
        <button type="button" className={styles.cancel} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={styles.confirm} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </ModalFooter>
    </Modal>
  )
}
