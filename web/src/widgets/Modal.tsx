import * as Dialog from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'

import styles from './Modal.module.css'

interface ModalProps {
  /** Names the dialog. */
  title: string
  /** A quiet line under the title — "6 tags". */
  subtitle?: string
  /** One sentence saying what the dialog is for, announced after the title. */
  description?: string
  /** The dialog's width in pixels. */
  width: number
  onClose: () => void
  children: ReactNode
}

/**
 * The shell every dialog here shares: the overlay, the centred card, the title, and the rules
 * about how it closes.
 */
export function Modal({ title, subtitle, description, width, onClose, children }: ModalProps) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content} style={{ width }}>
          <Dialog.Title className={styles.title}>{title}</Dialog.Title>
          {subtitle !== undefined && <p className={styles.subtitle}>{subtitle}</p>}
          {description !== undefined && (
            <Dialog.Description className={styles.description}>{description}</Dialog.Description>
          )}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** The row a dialog's buttons sit in: pushed right, evenly spaced. */
export function ModalFooter({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={className ? `${styles.footer} ${className}` : styles.footer}>{children}</div>
  )
}
