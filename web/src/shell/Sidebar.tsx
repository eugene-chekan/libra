import { NavLink } from 'react-router-dom'

import { primaryNav, routes } from '../routes'
import { Icon } from '../widgets/Icon'
import { AccountRow } from './AccountRow'
import { SharedShelvesSection } from './SharedShelvesSection'
import { ShelvesSection } from './ShelvesSection'
import styles from './Sidebar.module.css'
import { TagsSection } from './TagsSection'

/** The application frame's left column. */
export function Sidebar() {
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
        {/*
          Disabled until the upload screen exists. Announcing why matters more
          than it looks: `aria-disabled` with a title leaves the control
          focusable and explains itself, where a bare `disabled` attribute is
          silently skipped by the keyboard and tells a screen-reader user
          nothing about what is missing.
        */}
        <button
          type="button"
          className={styles.addBook}
          aria-disabled="true"
          title="Adding books arrives with the upload screen"
        >
          <Icon name="plus" size={16} />
          Add Book
        </button>
        <AccountRow />
      </div>
    </nav>
  )
}
