import { Link } from 'react-router-dom'

import { routes } from '../routes'
import { EmptyState } from '../widgets/EmptyState'
import styles from '../shell/AppShell.module.css'

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
