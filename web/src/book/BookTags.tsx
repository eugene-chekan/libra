import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Link } from 'react-router-dom'

import { messageFor } from '../api/errors'
import type { Book, Tag } from '../api/types'
import { useTags } from '../library/useTags'
import { routes } from '../routes'
import { useSession } from '../session/SessionProvider'
import { ErrorBlock } from '../widgets/ErrorBlock'
import { Icon } from '../widgets/Icon'
import menu from '../widgets/dropdownMenu.module.css'
import { useSetBookState } from './useBook'
import styles from './BookTags.module.css'

/** A book's tags, and the one place in the app that puts them there. */
export function BookTags({ book }: { book: Book }) {
  const { status } = useSession()
  const tags = useTags().data ?? []
  const setState = useSetBookState(book.id)

  const isAdmin = status.status === 'signed-in' && status.user.is_admin
  const settable = isAdmin ? tags : tags.filter((tag) => !tag.is_global)
  const settableIds = new Set(settable.map((tag) => tag.id))
  const onBook = tags.filter((tag) => book.tag_ids.includes(tag.id))

  /** Switches one tag on or off, and writes the result. */
  function toggle(tag: Tag) {
    const mine = book.tag_ids.filter((id) => settableIds.has(id))
    const next = mine.includes(tag.id) ? mine.filter((id) => id !== tag.id) : [...mine, tag.id]
    setState.mutate({ rating: book.rating, progress: book.progress, tag_ids: next })
  }

  return (
    <div className={styles.tags}>
      <ul className={styles.pills}>
        {onBook.map((tag) => (
          <li key={tag.id}>
            <Link className={styles.pill} to={`${routes.library}?tags=${tag.id}`}>
              {tag.name}
            </Link>
          </li>
        ))}

        <li>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button type="button" className={styles.add} disabled={setState.isPending}>
                <Icon name="plus" size={12} />
                Add Tag
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className={menu.menu}
                side="bottom"
                align="start"
                sideOffset={6}
                collisionPadding={8}
              >
                {settable.length === 0 && (
                  <DropdownMenu.Item className={menu.empty} disabled>
                    No tags yet
                  </DropdownMenu.Item>
                )}

                {settable.map((tag) => {
                  const on = book.tag_ids.includes(tag.id)
                  return (
                    <DropdownMenu.CheckboxItem
                      key={tag.id}
                      className={`${menu.item} ${menu.spread}`}
                      checked={on}
                      onSelect={() => toggle(tag)}
                    >
                      {tag.name}
                      {on && <Icon name="check" size={12} />}
                    </DropdownMenu.CheckboxItem>
                  )
                })}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </li>
      </ul>

      {setState.isError && <ErrorBlock message={messageFor(setState.error)} />}
    </div>
  )
}
