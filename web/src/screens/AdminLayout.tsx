import { NavLink, Outlet } from 'react-router-dom'

import { routes } from '../routes'
import shellStyles from '../shell/AppShell.module.css'
import styles from './AdminLayout.module.css'

const TABS = [
  { to: routes.adminUsers, label: 'Users' },
  { to: routes.adminMaintenance, label: 'Maintenance' },
] as const

/** `/admin/*` — the tab shell every admin section shares. */
export function AdminLayout() {
  return (
    <>
      <h1 className={shellStyles.pageTitle}>Admin</h1>
      <nav className={styles.tabs} aria-label="Admin sections">
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} className={styles.tab}>
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </>
  )
}
