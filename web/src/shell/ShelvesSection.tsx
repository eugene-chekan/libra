import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { useShelves } from '../library/useShelves'
import { routes } from '../routes'
import { ShelfManager } from '../shelves/ShelfManager'
import { Icon } from '../widgets/Icon'
import { SkeletonRows } from '../widgets/Skeleton'
import { CollapsibleSection } from './CollapsibleSection'
import styles from './FilterSection.module.css'

/**
 * The sidebar's SHELVES list — the caller's own shelves only. Other readers'
 * public ones are the SHARED WITH YOU section beneath this one.
 *
 * Clicking a shelf filters the library grid directly; there is no
 * intermediate management pane to open. Clicking the already-active shelf
 * clears the filter rather than doing nothing, which is what makes the row
 * double as its own "clear" control.
 *
 * The Manage Shelves row at the bottom now opens something, which is why it
 * exists at all — #63 deliberately left it out while the modal was unbuilt,
 * on the rule that a row opening nothing is worse than no row.
 *
 * The whole section still disappears when the reader has no shelves, taking
 * that row with it. The way to a first shelf is the Shelves page, whose empty
 * state offers exactly one thing to do.
 */
export function ShelvesSection() {
  const shelves = useShelves()
  const [searchParams] = useSearchParams()
  const activeShelfId = searchParams.get('shelf')
  const [managing, setManaging] = useState(false)

  const ownShelves = (shelves.data ?? []).filter((shelf) => shelf.editable)

  if (shelves.isPending) {
    return (
      <CollapsibleSection label="Shelves">
        <SkeletonRows rows={3} height="30px" />
      </CollapsibleSection>
    )
  }

  if (shelves.isError || ownShelves.length === 0) return null

  return (
    <>
      <CollapsibleSection label="Shelves">
        {ownShelves.map((shelf) => {
          const isActive = activeShelfId === String(shelf.id)
          const next = new URLSearchParams(searchParams)
          if (isActive) next.delete('shelf')
          else next.set('shelf', String(shelf.id))
          const query = next.toString()

          return (
            <Link
              key={shelf.id}
              to={query ? `${routes.library}?${query}` : routes.library}
              className={styles.row}
              aria-current={isActive ? 'true' : undefined}
            >
              {shelf.name}
            </Link>
          )
        })}

        <button type="button" className={styles.manageRow} onClick={() => setManaging(true)}>
          <Icon name="plus" size={12} />
          Manage Shelves
        </button>
      </CollapsibleSection>

      {managing && <ShelfManager onClose={() => setManaging(false)} />}
    </>
  )
}
