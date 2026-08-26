import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'

import { messageFor } from '../api/errors'
import type { Tag } from '../api/types'
import { useTags } from '../library/useTags'
import { useSession } from '../session/SessionProvider'
import { ConfirmDialog } from '../widgets/ConfirmDialog'
import { ErrorBlock } from '../widgets/ErrorBlock'
import { Modal, ModalFooter } from '../widgets/Modal'
import { TagManagerRow } from './TagManagerRow'
import { useCreateTag, useDeleteTag, useUpdateTag } from './useTagWrites'
import styles from './TagManager.module.css'

/** Manage Tags: create, rename and delete. */
export function TagManager({ onClose }: { onClose: () => void }) {
  const tags = useTags()
  const [searchParams, setSearchParams] = useSearchParams()

  const create = useCreateTag()
  const update = useUpdateTag()
  const remove = useDeleteTag((id) => {
    const active = (searchParams.get('tags') ?? '').split(',').filter(Boolean)
    if (!active.includes(String(id))) return

    const next = new URLSearchParams(searchParams)
    const left = active.filter((activeId) => activeId !== String(id))
    if (left.length > 0) next.set('tags', left.join(','))
    else next.delete('tags')
    setSearchParams(next, { replace: true })
  })

  const [newName, setNewName] = useState('')
  const [newIsShared, setNewIsShared] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Tag | null>(null)

  const session = useSession()
  const isAdmin = session.status.status === 'signed-in' && session.status.user.is_admin

  const all = tags.data ?? []
  const shared = all.filter((tag) => tag.is_global)
  const mine = all.filter((tag) => !tag.is_global)

  const busy = create.isPending || update.isPending || remove.isPending
  const error = create.error ?? update.error ?? remove.error

  function addTag(event: FormEvent) {
    event.preventDefault()
    const name = newName.trim()
    if (name === '' || busy) return
    create.mutate(
      { tag: { name }, makeGlobal: newIsShared },
      {
        onSuccess: () => {
          setNewName('')
          setNewIsShared(false)
        },
      }
    )
  }

  function deleteTag(tag: Tag) {
    remove.mutate(tag.id)
  }

  return (
    <>
      <Modal
        title="Manage Tags"
        subtitle={`${all.length} ${all.length === 1 ? 'tag' : 'tags'}`}
        width={440}
        onClose={onClose}
      >
        <div className={styles.scroller}>
          {shared.length > 0 && (
            <>
              <h3 className={styles.sectionLabel}>Shared</h3>
              <ul className={styles.list}>
                {shared.map((tag) => (
                  <TagManagerRow
                    key={tag.id}
                    tag={tag}
                    busy={busy}
                    onSave={(name) => update.mutate({ id: tag.id, patch: { name } })}
                    onDelete={() => setPendingDelete(tag)}
                  />
                ))}
              </ul>
            </>
          )}

          <h3 className={styles.sectionLabel}>Mine</h3>
          {mine.length === 0 ? (
            <p className={styles.empty}>No tags of your own yet.</p>
          ) : (
            <ul className={styles.list}>
              {mine.map((tag) => (
                <TagManagerRow
                  key={tag.id}
                  tag={tag}
                  busy={busy}
                  onSave={(name) => update.mutate({ id: tag.id, patch: { name } })}
                  onDelete={() => setPendingDelete(tag)}
                />
              ))}
            </ul>
          )}
        </div>

        <form className={styles.newRow} onSubmit={addTag}>
          <label className={styles.newLabel} htmlFor="new-tag-name">
            New tag
          </label>
          <div className={styles.newControls}>
            <input
              id="new-tag-name"
              className={styles.input}
              value={newName}
              placeholder="lent-out"
              aria-describedby="new-tag-hint"
              onChange={(event) => setNewName(event.target.value)}
            />
            <button type="submit" className={styles.add} disabled={busy}>
              Add
            </button>
          </div>
          {/* Said before the server has to refuse it. The search box reads
                  `#tag` and splits on spaces, so a two-word name would be a
                  tag nobody could search for. */}
          <p className={styles.hint} id="new-tag-hint">
            One word, with no spaces. Use a hyphen: lent-out.
          </p>

          {isAdmin && (
            <>
              <div className={styles.checkboxRow}>
                <input
                  id="new-tag-shared"
                  type="checkbox"
                  checked={newIsShared}
                  onChange={(event) => setNewIsShared(event.target.checked)}
                />
                <label htmlFor="new-tag-shared">Shared with everyone</label>
              </div>
              {/* Said only when it is about to happen, the way publishing a
                  shelf is. A shared tag is the one kind that stops being the
                  maker's own the moment it exists. */}
              {newIsShared && (
                <p className={styles.explanation}>
                  Everyone on this instance sees this tag. Only an admin can rename it, delete it,
                  or put it on a book.
                </p>
              )}
            </>
          )}
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
          message={
            pendingDelete.book_count === 0
              ? 'The tag goes. Nothing is on it. This cannot be undone.'
              : `The tag comes off ${pendingDelete.book_count} ${
                  pendingDelete.book_count === 1 ? 'book' : 'books'
                }, which stay in your library. This cannot be undone.`
          }
          confirmLabel="Delete"
          onClose={() => setPendingDelete(null)}
          onConfirm={() => {
            deleteTag(pendingDelete)
            setPendingDelete(null)
          }}
        />
      )}
    </>
  )
}
