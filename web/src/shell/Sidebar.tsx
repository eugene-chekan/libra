import { useState } from 'react'
import { NavLink } from 'react-router-dom'

import { AddBookModal } from '../addBook/AddBookModal'
import { useLibrarian } from '../librarian/LibrarianProvider'
import { primaryNav, routes } from '../routes'
import { useSession } from '../session/SessionProvider'
import { Icon } from '../widgets/Icon'
import { AccountRow } from './AccountRow'
import { VersionLine } from './VersionLine'
import { SharedShelvesSection } from './SharedShelvesSection'
import { ShelvesSection } from './ShelvesSection'
import styles from './Sidebar.module.css'
import { TagsSection } from './TagsSection'

/** The application frame's left column. */
export function Sidebar() {
  const [addBookOpen, setAddBookOpen] = useState(false)
  const { status } = useSession()
  const { open: openLibrarian } = useLibrarian()
  const isAdmin = status.status === 'signed-in' && status.user.is_admin

  return (
    <nav className={styles.sidebar} aria-label="Main">
      <NavLink to={routes.library} className={styles.logo}>
        libra
      </NavLink>

      <div className={styles.middle}>
        <div className={styles.nav}>
          {primaryNav.map(({ to, label, icon }) => (
            <NavLink key={to} to={to} className={styles.navRow}>
              <Icon name={icon} size={18} />
              {label}
            </NavLink>
          ))}
          <button type="button" className={styles.navRow} onClick={openLibrarian}>
            <Icon name="message-square" size={18} />
            Librarian
          </button>
          {isAdmin && (
            <NavLink to={routes.admin} className={styles.navRow}>
              <Icon name="shield" size={18} />
              Admin
            </NavLink>
          )}
        </div>

        <ShelvesSection />
        <SharedShelvesSection />
        <TagsSection />
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.addBook} onClick={() => setAddBookOpen(true)}>
          <Icon name="plus" size={16} />
          Add Book
        </button>
        <AccountRow />
        <VersionLine />
      </div>

      {addBookOpen && <AddBookModal onClose={() => setAddBookOpen(false)} />}
    </nav>
  )
}
