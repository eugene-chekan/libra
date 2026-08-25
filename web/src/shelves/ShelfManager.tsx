import { useState, type FormEvent } from 'react'

import { messageFor } from '../api/errors'
import type { Shelf } from '../api/types'
import { useShelves } from '../library/useShelves'
import { ConfirmDialog } from '../widgets/ConfirmDialog'
import { ErrorBlock } from '../widgets/ErrorBlock'
import { Modal, ModalFooter } from '../widgets/Modal'
import { ShelfManagerRow } from './ShelfManagerRow'
import { useDragReorder } from './useDragReorder'
import { useCreateShelf, useDeleteShelf, useReorderShelves, useUpdateShelf } from './useShelfWrites'
import styles from './ShelfManager.module.css'

/**
 * Manage Shelves: create, rename, reorder, publish, delete.
 *
 * **Only the reader's own shelves are here.** `GET /shelves` also returns
 * other readers' public ones, and there is nothing on this screen that could
 * be done to those — the server refuses every write, so listing them would be
 * listing rows whose every control is a refusal.
 *
 * **Reordering commits through `PUT /shelves/order`**, which takes the whole
 * list in one call. That makes a reorder one atomic decision rather than a
 * race between rows settling in whatever sequence they arrive.
 *
 * There are two ways to reorder and both are real: a mouse drag on the handle,
 * and the up/down buttons. The buttons are not a fallback — a drag cannot be
 * done from a keyboard at all, and reordering is not an optional flourish.
 *
 * One `busy` flag disables every control at once, because a list mid-write is
 * not one to drag rows around in. The new-shelf box is cleared only once the
 * server has the name, so a refused one is still there to correct.
 */
export function ShelfManager({ onClose }: { onClose: () => void }) {
  const shelves = useShelves()
  const mine = (shelves.data ?? []).filter((shelf) => shelf.editable)

  const create = useCreateShelf()
  const update = useUpdateShelf()
  const remove = useDeleteShelf()
  const reorder = useReorderShelves()

  const [newName, setNewName] = useState('')
  const [pendingDelete, setPendingDelete] = useState<Shelf | null>(null)

  const ids = mine.map((shelf) => shelf.id)
  const drag = useDragReorder(ids, (next) => reorder.mutate(next))

  const busy = create.isPending || update.isPending || remove.isPending || reorder.isPending
  const error = create.error ?? update.error ?? remove.error ?? reorder.error

  const byId = new Map(mine.map((shelf) => [shelf.id, shelf]))
  const rows = drag.order.map((id) => byId.get(id)).filter((shelf) => shelf !== undefined)

  function addShelf(event: FormEvent) {
    event.preventDefault()
    const name = newName.trim()
    if (name === '' || busy) return
    create.mutate({ name }, { onSuccess: () => setNewName('') })
  }

  function moveBy(index: number, direction: -1 | 1) {
    const next = [...ids]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    const [moved] = next.splice(index, 1)
    if (moved === undefined) return
    next.splice(target, 0, moved)
    reorder.mutate(next)
  }

  return (
    <>
      <Modal
        title="Manage Shelves"
        subtitle={`${mine.length} ${mine.length === 1 ? 'shelf' : 'shelves'}`}
        width={460}
        onClose={onClose}
      >
        {mine.length === 0 ? (
          <p className={styles.empty}>No shelves yet.</p>
        ) : (
          <ul className={styles.list}>
            {rows.map((shelf, index) => (
              <ShelfManagerRow
                key={shelf.id}
                shelf={shelf}
                dragging={drag.draggingId === shelf.id}
                canMoveUp={index > 0}
                canMoveDown={index < rows.length - 1}
                busy={busy}
                dragHandleProps={drag.handleProps(shelf.id)}
                onMove={(direction) => moveBy(index, direction)}
                onSave={(patch) => update.mutate({ id: shelf.id, patch })}
                onDelete={() => setPendingDelete(shelf)}
              />
            ))}
          </ul>
        )}

        <form className={styles.newRow} onSubmit={addShelf}>
          <label className={styles.newLabel} htmlFor="new-shelf-name">
            New shelf
          </label>
          <div className={styles.newControls}>
            <input
              id="new-shelf-name"
              className={styles.input}
              value={newName}
              placeholder="Reading Now"
              onChange={(event) => setNewName(event.target.value)}
            />
            <button type="submit" className={styles.add} disabled={busy}>
              Add
            </button>
          </div>
        </form>

        {error && <ErrorBlock message={messageFor(error)} />}

        <ModalFooter className={styles.footer}>
          <button type="button" className={styles.close} onClick={onClose}>
            Close
          </button>
        </ModalFooter>
      </Modal>

      {pendingDelete && (
        <ConfirmDialog
          title={`Delete ${pendingDelete.name}?`}
          message="The shelf goes; the books on it stay in your library. This cannot be undone."
          confirmLabel="Delete"
          onClose={() => setPendingDelete(null)}
          onConfirm={() => {
            remove.mutate(pendingDelete.id)
            setPendingDelete(null)
          }}
        />
      )}
    </>
  )
}
