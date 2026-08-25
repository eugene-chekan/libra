import { useState, type PointerEvent as ReactPointerEvent } from 'react'

import type { Shelf, ShelfPatch } from '../api/types'
import { Icon } from '../widgets/Icon'
import { PublicPill } from './PublicPill'
import styles from './ShelfManagerRow.module.css'

interface ShelfManagerRowProps {
  shelf: Shelf
  /** True while this row is the one being dragged, so it can be drawn as lifted. */
  dragging: boolean
  /** False for the first row: there is nothing above it to move past. */
  canMoveUp: boolean
  canMoveDown: boolean
  /** True while any write is in flight, which disables every control at once. */
  busy: boolean
  onMove: (direction: -1 | 1) => void
  onSave: (patch: ShelfPatch) => void
  onDelete: () => void
  dragHandleProps: { onPointerDown: (event: ReactPointerEvent) => void }
}

/**
 * One row of the Manage Shelves list: name, count, and what can be done to it.
 *
 * Editing happens **in the row**, not in a second dialog on top of the first.
 * The name and the visibility are one decision — "this shelf, called this,
 * seen by these people" — and splitting them across two surfaces would make a
 * rename and a publish feel like unrelated acts.
 *
 * `data-drag-id` is what the drag reads: it asks the document which row is
 * under the pointer.
 */
export function ShelfManagerRow({
  shelf,
  dragging,
  canMoveUp,
  canMoveDown,
  busy,
  onMove,
  onSave,
  onDelete,
  dragHandleProps,
}: ShelfManagerRowProps) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <li className={styles.row} data-drag-id={shelf.id}>
        <ShelfEditor
          shelf={shelf}
          onCancel={() => setEditing(false)}
          onSave={(patch) => {
            setEditing(false)
            onSave(patch)
          }}
        />
      </li>
    )
  }

  return (
    <li
      className={dragging ? `${styles.row} ${styles.dragging}` : styles.row}
      data-drag-id={shelf.id}
    >
      {/* Not a button. It starts a drag rather than doing something, and the
          keyboard path to the same result is the two arrows further along the
          row — which is why this is hidden from assistive technology instead
          of being announced as a control that cannot be operated. */}
      <span className={styles.handle} aria-hidden="true" {...dragHandleProps}>
        <Icon name="grip" size={16} />
      </span>

      <span className={styles.name}>{shelf.name}</span>
      {shelf.visibility === 'public' && <PublicPill />}
      <span className={styles.count}>{shelf.book_count}</span>

      <button
        type="button"
        className={styles.action}
        aria-label={`Move ${shelf.name} up`}
        disabled={!canMoveUp || busy}
        onClick={() => onMove(-1)}
      >
        <Icon name="chevron-up" size={14} />
      </button>
      <button
        type="button"
        className={styles.action}
        aria-label={`Move ${shelf.name} down`}
        disabled={!canMoveDown || busy}
        onClick={() => onMove(1)}
      >
        <Icon name="chevron-down" size={14} />
      </button>
      <button
        type="button"
        className={styles.action}
        aria-label={`Edit ${shelf.name}`}
        disabled={busy}
        onClick={() => setEditing(true)}
      >
        <Icon name="pencil" size={14} />
      </button>
      <button
        type="button"
        className={`${styles.action} ${styles.danger}`}
        aria-label={`Delete ${shelf.name}`}
        disabled={busy}
        onClick={onDelete}
      >
        <Icon name="trash" size={14} />
      </button>
    </li>
  )
}

/** The row's edit state: the name, and who can see it. */
function ShelfEditor({
  shelf,
  onSave,
  onCancel,
}: {
  shelf: Shelf
  onSave: (patch: ShelfPatch) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(shelf.name)
  const [isPublic, setIsPublic] = useState(shelf.visibility === 'public')
  const nameId = `shelf-name-${shelf.id}`
  const publicId = `shelf-public-${shelf.id}`

  return (
    <div className={styles.editor}>
      <label className={styles.label} htmlFor={nameId}>
        Name
      </label>
      <input
        id={nameId}
        className={styles.input}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />

      <div className={styles.checkboxRow}>
        <input
          id={publicId}
          type="checkbox"
          checked={isPublic}
          onChange={(event) => setIsPublic(event.target.checked)}
        />
        <label htmlFor={publicId}>Visible to other readers</label>
      </div>

      {/* Publishing is the only act in this application that shows something
          of yours to another person, so it gets a sentence rather than a bare
          switch — and only when it is about to happen. */}
      {isPublic && (
        <p className={styles.explanation}>
          Anyone with an account can see this shelf and the books on it. Only you can change it.
        </p>
      )}

      <div className={styles.editorFooter}>
        <button type="button" className={styles.cancel} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={styles.save}
          disabled={name.trim() === ''}
          onClick={() => onSave({ name: name.trim(), visibility: isPublic ? 'public' : 'private' })}
        >
          Save
        </button>
      </div>
    </div>
  )
}
