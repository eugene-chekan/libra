import { Link } from 'react-router-dom'

import { routes } from '../routes'
import { EmptyState } from '../widgets/EmptyState'
import { PendingScreen } from './PendingScreen'
import styles from '../shell/AppShell.module.css'

/**
 * The routed screens, as stand-ins.
 *
 * Each one is routed and reachable so the frame can be navigated and tested;
 * none of them has content yet. They are gathered in one file because that is
 * all they are — each moves to its own file when it grows a screen's worth of
 * code, which is the milestone that builds it.
 */

export function ShelvesScreen() {
  return <PendingScreen title="Shelves" milestone="the shelves milestone" />
}

export function ChatScreen() {
  return <PendingScreen title="Librarian" milestone="the librarian chat milestone" />
}

/**
 * Reached when no route matches.
 *
 * This is a client-side 404, not the server's. The server has its own for a
 * mistyped endpoint under `/api`, and the two are deliberately separate: one
 * is a reader who followed a stale link, the other is a caller who got the
 * path wrong. See docs/specs/client-stack.md.
 */
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
