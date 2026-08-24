import { useState, type FormEvent } from 'react'

import type { Tag } from '../api/types'
import { Icon } from '../widgets/Icon'
import { tagColour } from './tagColour'
import styles from './TagManagerRow.module.css'

interface TagManagerRowProps {
  tag: Tag
  /** True while any write is in flight, which disables every control at once. */
  busy: boolean
  onSave: (name: string) => void
  onDelete: () => void
}

/**
 * One row of Manage Tags: the colour dot, the name, how many books carry it,
 * and what this reader may do to it.
 *
 * **A row the caller cannot edit carries no pencil and no trash at all** —
 * not a greyed one. The server would refuse the write, and a control that
 * exists only to be refused is worse than no control. `editable` comes from
 * the server; it is not re-derived here from `is_global` and the session.
 */
export function TagManagerRow({ tag, busy, onSave, onDelete }: TagManagerRowProps) {
  const [editing, setEditing] = useState(false)

  return (
    <li className={styles.row}>
      <span className={styles.dot} style={{ background: tagColour(tag.name) }} aria-hidden="true" />

      {editing ? (
        <TagEditor
          tag={tag}
          onCancel={() => setEditing(false)}
          onSave={(name) => {
            setEditing(false)
            onSave(name)
          }}
        />
      ) : (
        <>
          <span className={styles.name}>{tag.name}</span>
          <span className={styles.count}>
            {tag.book_count} {tag.book_count === 1 ? 'book' : 'books'}
          </span>

          {tag.editable && (
            <>
              <button
                type="button"
                className={styles.action}
                aria-label={`Rename ${tag.name}`}
                disabled={busy}
                onClick={() => setEditing(true)}
              >
                <Icon name="pencil" size={14} />
              </button>
              <button
                type="button"
                className={`${styles.action} ${styles.danger}`}
                aria-label={`Delete ${tag.name}`}
                disabled={busy}
                onClick={onDelete}
              >
                <Icon name="trash" size={14} />
              </button>
            </>
          )}
        </>
      )}
    </li>
  )
}

/**
 * The row's edit state. A form, so Enter saves — renaming one word should not
 * require reaching for the mouse.
 */
function TagEditor({
  tag,
  onSave,
  onCancel,
}: {
  tag: Tag
  onSave: (name: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(tag.name)
  const nameId = `tag-name-${tag.id}`

  function submit(event: FormEvent) {
    event.preventDefault()
    if (name.trim() === '') return
    onSave(name.trim())
  }

  return (
    <form className={styles.editor} onSubmit={submit}>
      <label className={styles.editorLabel} htmlFor={nameId}>
        Name
      </label>
      <input
        id={nameId}
        className={styles.input}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <button type="button" className={styles.cancel} onClick={onCancel}>
        Cancel
      </button>
      <button type="submit" className={styles.save} disabled={name.trim() === ''}>
        Save
      </button>
    </form>
  )
}
