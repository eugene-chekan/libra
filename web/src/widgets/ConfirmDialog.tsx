import * as Dialog from '@radix-ui/react-dialog'

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
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <Dialog.Title className={styles.title}>{title}</Dialog.Title>
          <Dialog.Description className={styles.message}>{message}</Dialog.Description>
          <div className={styles.footer}>
            <button type="button" className={styles.cancel} onClick={onClose}>
              Cancel
            </button>
            <button type="button" className={styles.confirm} onClick={onConfirm}>
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
