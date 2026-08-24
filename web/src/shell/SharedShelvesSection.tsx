import { Link, useSearchParams } from 'react-router-dom'

import { useShelves } from '../library/useShelves'
import { routes } from '../routes'
import { CollapsibleSection } from './CollapsibleSection'
import styles from './FilterSection.module.css'
import sharedStyles from './SharedShelvesSection.module.css'

/**
 * The sidebar's SHARED WITH YOU list: public shelves belonging to other
 * readers on this instance.
 *
 * Two deliberate differences from the SHELVES section above it. It is
 * **collapsed by default**, because it is secondary — what somebody else
 * arranged, not what this reader did. And it is **hidden entirely when
 * empty**: on a single-user instance, which is the common case, the section
 * simply does not exist rather than explaining that nobody has shared
 * anything.
 *
 * Clicking one filters the library by it, exactly like the reader's own
 * shelves. That is the point of seeing a shared shelf at all — reading what
 * is on it.
 */
export function SharedShelvesSection() {
  const shelves = useShelves()
  const [searchParams] = useSearchParams()
  const activeShelfId = searchParams.get('shelf')

  const shared = (shelves.data ?? []).filter((shelf) => !shelf.editable)

  // No skeleton while loading either: a section that appears and then vanishes
  // is worse than one that arrives a moment late.
  if (shared.length === 0) return null

  return (
    <CollapsibleSection label="Shared with you" topMargin="28px" defaultOpen={false}>
      {shared.map((shelf) => {
        const isActive = activeShelfId === String(shelf.id)
        const next = new URLSearchParams(searchParams)
        if (isActive) next.delete('shelf')
        else next.set('shelf', String(shelf.id))
        const query = next.toString()

        return (
          <Link
            key={shelf.id}
            to={query ? `${routes.library}?${query}` : routes.library}
            className={`${styles.row} ${sharedStyles.row}`}
            aria-current={isActive ? 'true' : undefined}
          >
            <span className={sharedStyles.name}>{shelf.name}</span>
            {/* Whose it is, on its own line. Two readers can easily both have
                a shelf called "Favourites", and the name alone would not say
                which one this is. */}
            <span className={sharedStyles.owner}>by {shelf.owner_username}</span>
          </Link>
        )
      })}
    </CollapsibleSection>
  )
}
