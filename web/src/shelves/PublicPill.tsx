import { Icon } from '../widgets/Icon'
import styles from './PublicPill.module.css'

/** Marks a shelf everyone can see. */
export function PublicPill() {
  return (
    <span className={styles.pill}>
      <Icon name="eye" size={12} />
      Public
    </span>
  )
}
