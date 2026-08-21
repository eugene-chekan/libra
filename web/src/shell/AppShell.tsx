import { Outlet } from 'react-router-dom'

import { Sidebar } from './Sidebar'
import styles from './AppShell.module.css'

/**
 * Sidebar plus content pane — the frame every screen renders inside.
 *
 * The pane is a `<main>`, which gives assistive technology a landmark to jump
 * straight to and skip the navigation. That is one element doing the job a
 * "skip to content" link would otherwise have to.
 */
export function AppShell() {
  return (
    <div className={styles.shell}>
      <Sidebar />
      <main className={styles.pane}>
        <Outlet />
      </main>
    </div>
  )
}
