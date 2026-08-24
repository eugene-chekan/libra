import * as Dialog from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'

import styles from './Modal.module.css'

interface ModalProps {
  /** Names the dialog. Announced first, and the heading on screen. */
  title: string
  /**
   * A quiet line under the title — "6 tags". A count, not a sentence, so it
   * is deliberately not the accessible description.
   */
  subtitle?: string
  /**
   * One sentence saying what the dialog is for, announced after the title.
   * Omit it when the body speaks for itself.
   */
  description?: string
  /** The dialog's width in pixels. The one measurement each dialog owns. */
  width: number
  onClose: () => void
  children: ReactNode
}

/**
 * The shell every dialog here shares: the overlay, the centred card, the
 * title, and the rules about how it closes.
 *
 * It exists because four dialogs had written all of that out separately, and
 * the copies had already drifted: the Kindle Email modal had no `max-width`,
 * so a narrow window pushed it off the side, and its `.field` className named
 * a rule that did not exist. Neither was visible while the shell was four
 * files saying almost the same thing.
 *
 * **The description is a real slot, not a prop passed through.** Radix sets
 * `aria-describedby` only when a `Dialog.Description` is actually rendered
 * (`descriptionPresent` in react-dialog 1.1.23), so a dialog either supplies
 * that sentence and has it announced, or supplies nothing and the attribute
 * stays off. Two of these dialogs used to carry `aria-describedby={undefined}`
 * to opt out of a warning that this version does not raise; that is gone.
 *
 * Closing is Radix's own: Escape, a click on the overlay, and the focus trap
 * that comes with it. Each dialog supplies its own visible Close or Cancel
 * button in `children`, because the words on that button belong to the dialog.
 */
export function Modal({ title, subtitle, description, width, onClose, children }: ModalProps) {
  // Spread rather than passed: with a description present, Radix's own
  // generated id has to survive, so the prop must be absent — not undefined.
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

/**
 * The row a dialog's buttons sit in: pushed right, evenly spaced.
 *
 * A component rather than a class the stylesheets `composes` from. Both put
 * the rule in one place, but composition across CSS Module files makes
 * PostCSS resolve an import during tests and warn on every run, and a warning
 * nobody can act on is how real ones get ignored.
 *
 * `className` is for a dialog's own spacing above the row, which differs with
 * what sits over it.
 */
export function ModalFooter({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={className ? `${styles.footer} ${className}` : styles.footer}>{children}</div>
  )
}
