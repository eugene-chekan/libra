import { Link } from 'react-router-dom'

import { routes } from '../routes'
import { EmptyState } from '../widgets/EmptyState'
import { PendingScreen } from './PendingScreen'
import styles from '../shell/AppShell.module.css'

/**
 * The routed screens that are still stand-ins.
 *
 * Each is routed and reachable so the frame can be navigated and tested; none
 * has content yet. They are gathered in one file because that is all they are
 * — each moves to its own file when it grows a screen's worth of code, which
 * is the milestone that builds it. Login, Library, Book and Shelves have all
 * left this file that way.
 */

export function ChatScreen() {
  return <PendingScreen title="Librarian" milestone="the librarian chat milestone (#32)" />
}

/**
 * `/books/:id/read`, which milestone 12 (#36) builds.
 *
 * Routed now, empty now, because the book detail screen's primary button says
 * "Start Reading" and has to lead somewhere. The Flutter client pointed the
 * same button at an address that matched nothing, so a reader who pressed the
 * most prominent control on the screen was told the page did not exist.
 */
export function ReaderScreen() {
  return <PendingScreen title="Reader" milestone="the reader milestone (#36)" />
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
