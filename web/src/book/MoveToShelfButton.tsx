import * as DropdownMenu from '@radix-ui/react-dropdown-menu'

import type { Shelf } from '../api/types'
import { Icon } from '../widgets/Icon'
import menu from '../widgets/dropdownMenu.module.css'
import buttons from './actionButtons.module.css'

interface MoveToShelfButtonProps {
  /** Every shelf the reader can see. */
  shelves: Shelf[]
  currentShelfId: number | null
  /** Called with the shelf to move to, or null to take the book off its shelf. */
  onSelect: (shelfId: number | null) => void
}

/** Move to Shelf, with its upward dropdown. */
export function MoveToShelfButton({ shelves, currentShelfId, onSelect }: MoveToShelfButtonProps) {
  const mine = shelves.filter((shelf) => shelf.editable)

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className={`${buttons.outlined} ${buttons.small}`}>
          Move to Shelf
          <Icon name="chevron-up" size={10} />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={menu.menu}
          side="top"
          align="start"
          sideOffset={6}
          collisionPadding={8}
        >
          {mine.length === 0 && (
            <DropdownMenu.Item className={menu.empty} disabled>
              No shelves yet
            </DropdownMenu.Item>
          )}

          {mine.map((shelf) => (
            <DropdownMenu.Item
              key={shelf.id}
              className={`${menu.item} ${menu.spread}`}
              onSelect={() => onSelect(shelf.id)}
            >
              {shelf.name}
              {shelf.id === currentShelfId && <Icon name="check" size={12} />}
            </DropdownMenu.Item>
          ))}

          {/* Only when there is a shelf to remove it from. Otherwise this is a
              row that cannot do anything. */}
          {currentShelfId !== null && (
            <>
              <DropdownMenu.Separator className={menu.separator} />
              <DropdownMenu.Item
                className={`${menu.item} ${menu.muted}`}
                onSelect={() => onSelect(null)}
              >
                <Icon name="x" size={12} />
                Remove from shelf
              </DropdownMenu.Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
