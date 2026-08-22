import { NavLink } from 'react-router-dom'

import { primaryNav, routes } from '../routes'
import { Icon } from '../widgets/Icon'
import { AccountRow } from './AccountRow'
import styles from './Sidebar.module.css'

/**
 * The application frame's left column.
 *
 * Every row here is a real element — `NavLink` renders an `<a href>`, and Add
 * Book is a `<button>`. That is the whole point of the rewrite. The Flutter
 * client wrapped each of these in `Semantics(button: true)` and measured, on a
 * running build, that not one of them reached the page: nine nodes existed in
 * the framework and a screen reader found nothing (#50). Here the keyboard and
 * the accessibility tree come from the elements themselves, and there is no
 * layer in between that can drop them.
 *
 * `NavLink` also sets `aria-current="page"` on the active row, which is what
 * the active styling hangs off — so the visual state and the announced state
 * cannot disagree, because they are the same attribute.
 *
 * The SHELVES, SHARED WITH YOU and TAGS sections are deliberately absent.
 * They need real data, and an empty section carrying invented copy would be
 * harder to replace than nothing at all.
 */
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
