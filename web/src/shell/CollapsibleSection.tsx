import { useState, type ReactNode } from 'react'

import { Icon } from '../widgets/Icon'
import styles from './CollapsibleSection.module.css'

interface CollapsibleSectionProps {
  label: string
  children: ReactNode
  /**
   * Shelves and Tags use slightly different top margins (32px vs 28px) — everything else about
   * the two is identical.
   */
  topMargin?: string
  /** Whether the section starts open. */
  defaultOpen?: boolean
}

/**
 * The SHELVES/TAGS sidebar pattern: a section label with a chevron that rotates when collapsed,
 * open by default.
 */
export function CollapsibleSection({
  label,
  children,
  topMargin,
  defaultOpen = true,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={styles.section} style={topMargin ? { marginTop: topMargin } : undefined}>
      <button
        type="button"
        className={styles.header}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        aria-expanded={open}
      >
        <span className={styles.label}>{label}</span>
        <Icon
          name="chevron-down"
          size={12}
          className={open ? styles.chevron : styles.chevronCollapsed}
        />
      </button>
      {open && <div className={styles.body}>{children}</div>}
    </div>
  )
}
