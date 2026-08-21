import { Icon } from './Icon'
import styles from './ErrorBlock.module.css'

interface ErrorBlockProps {
  /** What went wrong, in a sentence the reader can act on. */
  message: string
  /**
   * Omit where retrying makes no sense — a 403 will not become a 200 because
   * the reader pressed a button, and offering the button says otherwise.
   */
  onRetry?: () => void
}

/**
 * The application's one error shape.
 *
 * `role="alert"` so a screen reader announces it when it appears. This is the
 * counterpart of the retry decision in queryClient.ts: failure is reported
 * once, visibly, and retrying is the reader's call. An automatic retry racing
 * this block makes it blink in and out, and the reader cannot tell whether
 * their click did anything.
 */
export function ErrorBlock({ message, onRetry }: ErrorBlockProps) {
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
    </div>
  )
}
