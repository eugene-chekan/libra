import { EmptyState } from '../widgets/EmptyState'
import styles from '../shell/AppShell.module.css'

interface PendingScreenProps {
  title: string
  /** The milestone in docs/specs/phase-4-plan.md that builds this screen. */
  milestone: string
}

/**
 * A stand-in for a screen that is routed but not built.
 *
 * **Delete each use of this the moment its screen ships.** The Flutter client
 * left `PendingScreen(title: 'Book', issue: '#27')` in place after #27 merged,
 * so the app told readers the book screen was unbuilt while they were using
 * it. A stand-in that outlives what it stood in for is worse than a blank
 * pane, because it is confidently wrong. The rule is in
 * docs/specs/code-style.md and it is what this comment exists to enforce.
 *
 * It names a milestone, and the issue number too wherever the rewrite has
 * filed one — a placeholder pointing at nothing is the same defect one step
 * earlier. The shelves screen has no number yet because its TypeScript issue
 * is not open; add it when it is.
 */
export function PendingScreen({ title, milestone }: PendingScreenProps) {
  return (
    <>
      <h1 className={styles.pageTitle}>{title}</h1>
      <EmptyState title="Not built yet" hint={`This screen arrives with ${milestone}.`} />
    </>
  )
}
