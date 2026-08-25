import type { ReactNode } from 'react'

import styles from './EmptyState.module.css'

interface EmptyStateProps {
  title: string
  /** One line under the title. */
  hint?: string
  /** The single thing to do from here, if there is one. */
  action?: ReactNode
}

/** The centred empty state, for a screen with nothing on it yet. */
export function EmptyState({ title, hint, action }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <p className={styles.title}>{title}</p>
      {hint && <p className={styles.hint}>{hint}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  )
}
