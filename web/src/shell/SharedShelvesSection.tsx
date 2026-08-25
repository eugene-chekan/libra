import { Link, useSearchParams } from 'react-router-dom'

import { useShelves } from '../library/useShelves'
import { routes } from '../routes'
import { CollapsibleSection } from './CollapsibleSection'
import styles from './FilterSection.module.css'
import sharedStyles from './SharedShelvesSection.module.css'

/**
 * The sidebar's SHARED WITH YOU list: public shelves belonging to other readers on this
 * instance.
 */
export function SharedShelvesSection() {
  const shelves = useShelves()
  const [searchParams] = useSearchParams()
  const activeShelfId = searchParams.get('shelf')

  const shared = (shelves.data ?? []).filter((shelf) => !shelf.editable)

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
