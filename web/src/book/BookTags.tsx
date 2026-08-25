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

/**
 * A book's tags, and the one place in the app that puts them there.
 *
 * The pills are links, as they always were: clicking one asks "what else is
 * like this?" and filters the library. **Add Tag** beside them is what was
 * missing — until it, a tag could be created and looked at but never attached
 * to anything, because the tag manager curates the vocabulary and this screen
 * only read it.
 *
 * **It saves the moment a tag is switched on or off.** Tags are the reader's
 * own state, like the rating and the shelf beside them, so there is nothing to
 * confirm and no Save button. They deliberately do not live in the Edit Book
 * form: that form writes the shared catalog and is admin-only, and a personal
 * tag is the one thing on this screen that belongs to whoever is reading.
 */
export function BookTags({ book }: { book: Book }) {
  const { status } = useSession()
  const tags = useTags().data ?? []
  const setState = useSetBookState(book.id)

  const isAdmin = status.status === 'signed-in' && status.user.is_admin

  // What this caller may put on a book. A global tag describes the book for
  // the whole household, so only an admin may hang one — the server answers
  // anybody else with a 403, and a row that exists to be refused is worse
  // than no row.
  const settable = isAdmin ? tags : tags.filter((tag) => !tag.is_global)
  const settableIds = new Set(settable.map((tag) => tag.id))
  const onBook = tags.filter((tag) => book.tag_ids.includes(tag.id))

  /**
   * `PUT /state` replaces exactly what the caller may set, so the list sent
   * has to be exactly that much of the book's current tags — no more.
   *
   * For a reader that is their personal tags: the book's global ones are left
   * out and stay where they are. For an admin it is everything, because their
   * write replaces global tags too, and leaving one out would take it off.
   */
  function toggle(tag: Tag) {
    const mine = book.tag_ids.filter((id) => settableIds.has(id))
    const next = mine.includes(tag.id) ? mine.filter((id) => id !== tag.id) : [...mine, tag.id]
    // `rating` and `progress` go every time. This is a PUT: a field left out
    // is set to zero rather than left alone.
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
                      // Closes on each pick, which is Radix's default and the
                      // right behaviour here: adding a pill widens the row and
                      // pushes this menu's trigger to the right, so a menu that
                      // stayed open would jump out from under the pointer.
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
