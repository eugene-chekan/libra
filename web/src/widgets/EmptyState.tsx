import type { ReactNode } from 'react'

import styles from './EmptyState.module.css'

interface EmptyStateProps {
  title: string
  /** One line under the title. Omit where the title says everything. */
  hint?: string
  /** The single thing to do from here, if there is one. */
  action?: ReactNode
}

/**
 * The centred empty state, for a screen with nothing on it yet.
 *
 * client-design.md keeps this distinct from the *search* empty state, which
 * stays as the handoff drew it — plain 14px `textLight` text reading "No books
 * match your search." The difference is real: an empty library has one obvious
 * next step and should offer it, while an empty search result is a fact about
 * the query and offering an action there would be noise.
 */
export function EmptyState({ title, hint, action }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <p className={styles.title}>{title}</p>
      {hint && <p className={styles.hint}>{hint}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  )
}
