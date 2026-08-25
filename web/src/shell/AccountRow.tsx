import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useState } from 'react'

import { useSession } from '../session/SessionProvider'
import { useSaveKindleEmail } from '../session/useSaveKindleEmail'
import { Icon } from '../widgets/Icon'
import { KindleEmailModal } from '../widgets/KindleEmailModal'
import menu from '../widgets/dropdownMenu.module.css'
import styles from './AccountRow.module.css'

/**
 * The sidebar footer's account area: avatar, username, and the dropdown that
 * holds Kindle Email and Sign Out. `client-design.md` calls this "new
 * furniture" — the handoff's sidebar had no account area and therefore
 * nowhere to sign out.
 *
 * Reads the session itself rather than taking the user as a prop, the same
 * way every other widget reads what it uses. It renders nothing before the
 * session resolves and nothing once it resolves signed-out — in the wired
 * app this component only ever mounts inside `RequireSession`, so that branch
 * is unreachable in practice, but the type is a union and this is the honest
 * way to narrow it.
 *
 * Manage Users is deliberately absent from the dropdown, admin or not — it is
 * #31, and a row that opened nothing would be worse than no row at all.
 */
export function AccountRow() {
  const { status, signOut } = useSession()
  const saveKindleEmail = useSaveKindleEmail()
  const [kindleModalOpen, setKindleModalOpen] = useState(false)

  if (status.status !== 'signed-in') return null
  const { user } = status

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button type="button" className={styles.row}>
            <span className={styles.avatar}>{user.username.charAt(0).toUpperCase()}</span>
            <span className={styles.identity}>
              <span className={styles.username}>{user.username}</span>
              {user.is_admin && <span className={styles.adminLabel}>Admin</span>}
            </span>
            <Icon name="chevron-up" size={14} className={styles.chevron} />
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
            <DropdownMenu.Item className={menu.item} onSelect={() => setKindleModalOpen(true)}>
              Kindle Email…
            </DropdownMenu.Item>
            <DropdownMenu.Separator className={menu.separator} />
            <DropdownMenu.Item
              className={`${menu.item} ${menu.muted}`}
              onSelect={() => {
                void signOut()
              }}
            >
              <Icon name="log-out" size={12} />
              Sign Out
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {kindleModalOpen && (
        <KindleEmailModal
          currentEmail={user.kindle_email}
          onClose={() => setKindleModalOpen(false)}
          onSave={async (kindle_email) => {
            await saveKindleEmail(kindle_email)
            setKindleModalOpen(false)
          }}
        />
      )}
    </>
  )
}
