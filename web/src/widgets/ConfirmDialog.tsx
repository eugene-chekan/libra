import { Modal, ModalFooter } from './Modal'
import styles from './ConfirmDialog.module.css'

interface ConfirmDialogProps {
  /** A question, naming the thing. */
  title: string
  /** What will happen, in full. */
  message: string
  /** The verb on the button that goes ahead. */
  confirmLabel: string
  onConfirm: () => void
  onClose: () => void
}

/** The application's one confirmation, for a step that cannot be undone. */
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
