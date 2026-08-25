import { useState } from 'react'

import { messageFor } from '../api/errors'
import { useShelves } from '../library/useShelves'
import { ShelfBlock } from '../shelves/ShelfBlock'
import { ShelfManager } from '../shelves/ShelfManager'
import shellStyles from '../shell/AppShell.module.css'
import { EmptyState } from '../widgets/EmptyState'
import { ErrorBlock } from '../widgets/ErrorBlock'
import { SkeletonDelay, SkeletonRows } from '../widgets/Skeleton'
import styles from './ShelvesScreen.module.css'

/** `/shelves` — the browse view of what the sidebar filters by. */
export function ShelvesScreen() {
  const shelves = useShelves()
  const [managing, setManaging] = useState(false)

  const mine = (shelves.data ?? []).filter((shelf) => shelf.editable)
  const shared = (shelves.data ?? []).filter((shelf) => !shelf.editable)
  const nothingAtAll = shelves.isSuccess && mine.length === 0 && shared.length === 0

  return (
    <>
      <div className={styles.headerRow}>
        <h1 className={shellStyles.pageTitle}>Shelves</h1>
        {!nothingAtAll && (
          <button type="button" className={styles.manage} onClick={() => setManaging(true)}>
            Manage Shelves
          </button>
        )}
      </div>

      {shelves.isPending && (
        <SkeletonDelay>
          <SkeletonRows rows={3} height="150px" />
        </SkeletonDelay>
      )}

      {shelves.isError && (
        <ErrorBlock message={messageFor(shelves.error)} onRetry={() => void shelves.refetch()} />
      )}

      {nothingAtAll && (
        <EmptyState
          title="No shelves yet"
          hint="A shelf is your own arrangement of the library."
          action={
            <button type="button" className={styles.newShelf} onClick={() => setManaging(true)}>
              New Shelf
            </button>
          }
        />
      )}

      {mine.map((shelf) => (
        <ShelfBlock key={shelf.id} shelf={shelf} />
      ))}

      {/* Hidden entirely when empty. On a single-user instance — the common
          case — this section does not exist, rather than showing a zero state
          explaining that nobody has shared anything. */}
      {shared.length > 0 && (
        <>
          <h2 className={styles.sharedLabel}>Shared with you</h2>
          {shared.map((shelf) => (
            <ShelfBlock key={shelf.id} shelf={shelf} />
          ))}
        </>
      )}

      {managing && <ShelfManager onClose={() => setManaging(false)} />}
    </>
  )
}
