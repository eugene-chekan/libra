import { EmptyState } from '../widgets/EmptyState'
import styles from '../shell/AppShell.module.css'

interface PendingScreenProps {
  title: string
  /** The milestone in docs/specs/phase-4-plan.md that builds this screen. */
  milestone: string
}

/** A stand-in for a screen that is routed but not built. */
export function PendingScreen({ title, milestone }: PendingScreenProps) {
  return (
    <>
      <h1 className={styles.pageTitle}>{title}</h1>
      <EmptyState title="Not built yet" hint={`This screen arrives with ${milestone}.`} />
    </>
  )
}
