import type { ReactNode } from 'react'

import { Icon } from './Icon'
import styles from './ErrorBlock.module.css'

interface ErrorBlockProps {
  /** What went wrong, in a sentence the reader can act on. */
  message: string
  /**
   * Omit where retrying makes no sense — a 403 will not become a 200 because the reader pressed
   * a button, and offering the button says otherwise.
   */
  onRetry?: () => void
  /** Where to go instead, for a failure that retrying cannot fix. */
  action?: ReactNode
}

/** The application's one error shape. */
export function ErrorBlock({ message, onRetry, action }: ErrorBlockProps) {
  return (
    <div className={styles.block} role="alert">
      <p className={styles.message}>
        <Icon name="alert-circle" size={14} className={styles.icon} />
        {message}
      </p>
      {onRetry && (
        <button type="button" className={styles.retry} onClick={onRetry}>
          <Icon name="rotate-cw" size={12} />
          Try again
        </button>
      )}
      {action}
    </div>
  )
}
