import { Icon } from '../widgets/Icon'
import styles from './PublicPill.module.css'

/**
 * Marks a shelf everyone can see.
 *
 * **Only public shelves are labelled, and the asymmetry is the point.**
 * Private is the default and the common case, so a "Private" pill on every
 * other row would be noise. This one marks the shelf that is not the norm.
 */
export function PublicPill() {
  return (
    <span className={styles.pill}>
      <Icon name="eye" size={12} />
      Public
    </span>
  )
}
