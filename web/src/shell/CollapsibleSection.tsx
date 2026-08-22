import { useState, type ReactNode } from 'react'

import { Icon } from '../widgets/Icon'
import styles from './CollapsibleSection.module.css'

interface CollapsibleSectionProps {
  label: string
  children: ReactNode
  /** Shelves and Tags use slightly different top margins (32px vs 28px) — everything else about the two is identical. Defaults to 32px. */
  topMargin?: string
}

/**
 * The SHELVES/TAGS sidebar pattern: a section label with a chevron that
 * rotates when collapsed, open by default. Shared because both sections use
 * the exact same mechanics — only what they list differs.
 */
export function CollapsibleSection({ label, children, topMargin }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(true)

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
