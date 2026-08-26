import { useState } from 'react'
import { NavLink } from 'react-router-dom'

import { AddBookModal } from '../addBook/AddBookModal'
import { primaryNav, routes } from '../routes'
import { Icon } from '../widgets/Icon'
import { AccountRow } from './AccountRow'
import { SharedShelvesSection } from './SharedShelvesSection'
import { ShelvesSection } from './ShelvesSection'
import styles from './Sidebar.module.css'
import { TagsSection } from './TagsSection'

/** The application frame's left column. */
export function Sidebar() {
  const [addBookOpen, setAddBookOpen] = useState(false)

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
      </div>

      {addBookOpen && <AddBookModal onClose={() => setAddBookOpen(false)} />}
    </nav>
  )
}
