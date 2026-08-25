import { Link } from 'react-router-dom'

import { routes } from '../routes'
import { EmptyState } from '../widgets/EmptyState'
import { PendingScreen } from './PendingScreen'
import styles from '../shell/AppShell.module.css'

/** The routed screens that are still stand-ins. */

export function ChatScreen() {
  return <PendingScreen title="Librarian" milestone="the librarian chat milestone (#32)" />
}

/** `/books/:id/read`, which milestone 12 (#36) builds. */
export function ReaderScreen() {
  return <PendingScreen title="Reader" milestone="the reader milestone (#36)" />
}

/** Reached when no route matches. */
export function NotFoundScreen() {
  return (
    <>
      <h1 className={styles.pageTitle}>Not found</h1>
      <EmptyState
        title="There is nothing at this address"
        hint="The link may be out of date."
        action={<Link to={routes.library}>Back to the library</Link>}
      />
    </>
  )
}
