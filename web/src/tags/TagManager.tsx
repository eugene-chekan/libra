import * as Dialog from '@radix-ui/react-dialog'
import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'

import { messageFor } from '../api/errors'
import type { Tag } from '../api/types'
import { useTags } from '../library/useTags'
import { ConfirmDialog } from '../widgets/ConfirmDialog'
import { ErrorBlock } from '../widgets/ErrorBlock'
import { TagManagerRow } from './TagManagerRow'
import { useCreateTag, useDeleteTag, useUpdateTag } from './useTagWrites'
import styles from './TagManager.module.css'

/**
 * Manage Tags: create, rename and delete.
 *
 * **Two sections, because there are two kinds of tag and only one of them is
 * yours.** SHARED holds the household's global vocabulary — "Sci-Fi" is a
 * fact about a book everyone should agree on — and an ordinary reader sees it
 * without any controls, because the server would refuse the write. MINE holds
 * personal tags, invisible to everybody else. An admin may edit both, and the
 * server says which through `editable` rather than this screen working it out.
 *
 * **Every change commits on its own, like Manage Shelves.** The prototype
 * batched them behind Save Changes; that means a half-applied batch when one
 * rename is refused and a delete has already gone through, and no way for the
 * reader to tell which. One write, one row, one answer.
 *
 * Deleting a tag also takes it out of the filter in the address bar. It would
 * otherwise leave the grid filtered by an id that no longer exists, which
 * reads as an empty library.
 */
export function TagManager({ onClose }: { onClose: () => void }) {
  const tags = useTags()
  const [searchParams, setSearchParams] = useSearchParams()

  const create = useCreateTag()
  const update = useUpdateTag()
  const remove = useDeleteTag()

  const [newName, setNewName] = useState('')
  const [pendingDelete, setPendingDelete] = useState<Tag | null>(null)

  const all = tags.data ?? []
  const shared = all.filter((tag) => tag.is_global)
  const mine = all.filter((tag) => !tag.is_global)

  // One flag for every control in the dialog: a list mid-write is not one to
  // start a second write in.
  const busy = create.isPending || update.isPending || remove.isPending
  const error = create.error ?? update.error ?? remove.error

  function addTag(event: FormEvent) {
    event.preventDefault()
    const name = newName.trim()
    if (name === '' || busy) return
    // Cleared only once the server has it, so a refused name is still in the
    // box to be corrected rather than gone.
    create.mutate({ name }, { onSuccess: () => setNewName('') })
  }

  function deleteTag(tag: Tag) {
    remove.mutate(tag.id, {
      onSuccess: () => {
        const active = (searchParams.get('tags') ?? '').split(',').filter(Boolean)
        if (!active.includes(String(tag.id))) return

        const next = new URLSearchParams(searchParams)
        const left = active.filter((id) => id !== String(tag.id))
        if (left.length > 0) next.set('tags', left.join(','))
        else next.delete('tags')
        setSearchParams(next, { replace: true })
      },
    })
  }

  return (
    <>
      <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.overlay} />
          <Dialog.Content className={styles.content} aria-describedby={undefined}>
            <Dialog.Title className={styles.title}>Manage Tags</Dialog.Title>
            <p className={styles.count}>
              {all.length} {all.length === 1 ? 'tag' : 'tags'}
            </p>

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
            </form>

            {error && <ErrorBlock message={messageFor(error)} />}

            <div className={styles.footer}>
              <button type="button" className={styles.close} onClick={onClose}>
                Close
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

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
