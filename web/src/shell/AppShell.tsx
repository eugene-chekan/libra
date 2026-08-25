import { Outlet } from 'react-router-dom'

import { Sidebar } from './Sidebar'
import styles from './AppShell.module.css'

/** Sidebar plus content pane — the frame every screen renders inside. */
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
