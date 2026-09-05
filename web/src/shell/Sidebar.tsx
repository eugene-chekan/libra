import { useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

import { AddBookModal } from '../addBook/AddBookModal'
import { useLibrarian } from '../librarian/LibrarianProvider'
import { primaryNav, routes } from '../routes'
import { useSession } from '../session/SessionProvider'
import { Icon, type IconName } from '../widgets/Icon'
import { Tooltip } from '../widgets/Tooltip'
import hidden from '../widgets/visuallyHidden.module.css'
import { AccountRow } from './AccountRow'
import { VersionLine } from './VersionLine'
import { SharedShelvesSection } from './SharedShelvesSection'
import { ShelvesSection } from './ShelvesSection'
import { loadCollapsed, saveCollapsed } from './sidebarCollapsed'
import styles from './Sidebar.module.css'
import { TagsSection } from './TagsSection'

/** The application frame's left column. */
export function Sidebar() {
  const [addBookOpen, setAddBookOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(loadCollapsed)
  const { status } = useSession()
  const { open: openLibrarian } = useLibrarian()
  const isAdmin = status.status === 'signed-in' && status.user.is_admin

  function toggle() {
    setCollapsed((wasCollapsed) => {
      saveCollapsed(!wasCollapsed)
      return !wasCollapsed
    })
  }

  const row = collapsed ? `${styles.navRow} ${styles.iconOnly}` : styles.navRow

  return (
    <nav
      className={collapsed ? `${styles.sidebar} ${styles.narrow}` : styles.sidebar}
      aria-label="Main"
    >
      <div className={styles.top}>
        {/* The wordmark is words, and there is no mark to fall back to. Collapsed, the row is
            the toggle alone — Library is one row below and goes to the same place. */}
        {!collapsed && (
          <NavLink to={routes.library} className={styles.logo}>
            libra
          </NavLink>
        )}
        <button
          type="button"
          className={styles.toggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          onClick={toggle}
        >
          <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size={16} />
        </button>
      </div>

      <div className={styles.middle}>
        <div className={styles.nav}>
          {primaryNav.map(({ to, label, icon }) => (
            <Named key={to} label={label} collapsed={collapsed}>
              <NavLink to={to} className={row}>
                <RowFace icon={icon} label={label} collapsed={collapsed} />
              </NavLink>
            </Named>
          ))}
          <Named label="Librarian" collapsed={collapsed}>
            <button type="button" className={row} onClick={openLibrarian}>
              <RowFace icon="message-square" label="Librarian" collapsed={collapsed} />
            </button>
          </Named>
          {isAdmin && (
            <Named label="Admin" collapsed={collapsed}>
              <NavLink to={routes.admin} className={row}>
                <RowFace icon="shield" label="Admin" collapsed={collapsed} />
              </NavLink>
            </Named>
          )}
        </div>

        {/* A shelf called "Finished 2026" does not reduce to an icon, so collapsed these are
            gone rather than abbreviated. Every one of them is a filter the Shelves page and the
            search box still reach. */}
        {!collapsed && (
          <>
            <ShelvesSection />
            <SharedShelvesSection />
            <TagsSection />
          </>
        )}
      </div>

      <div className={styles.footer}>
        <Named label="Add Book" collapsed={collapsed}>
          <button
            type="button"
            className={collapsed ? `${styles.addBook} ${styles.iconOnly}` : styles.addBook}
            onClick={() => setAddBookOpen(true)}
          >
            <RowFace icon="plus" label="Add Book" collapsed={collapsed} iconSize={16} />
          </button>
        </Named>
        <AccountRow collapsed={collapsed} />
        {!collapsed && <VersionLine />}
      </div>

      {addBookOpen && <AddBookModal onClose={() => setAddBookOpen(false)} />}
    </nav>
  )
}

/** The icon, and the label either drawn or left for a screen reader alone. */
function RowFace({
  icon,
  label,
  collapsed,
  iconSize = 18,
}: {
  icon: IconName
  label: string
  collapsed: boolean
  iconSize?: number
}) {
  return (
    <>
      <Icon name={icon} size={iconSize} />
      {collapsed ? <span className={hidden.visuallyHidden}>{label}</span> : label}
    </>
  )
}

/** Names a row on hover, but only while it has no label to read. */
function Named({
  label,
  collapsed,
  children,
}: {
  label: string
  collapsed: boolean
  children: ReactNode
}) {
  if (!collapsed) return children
  return (
    <Tooltip label={label} side="right">
      {children}
    </Tooltip>
  )
}
