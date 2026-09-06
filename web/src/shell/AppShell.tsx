import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import { useLibrarian } from '../librarian/LibrarianProvider'
import { Icon } from '../widgets/Icon'
import hidden from '../widgets/visuallyHidden.module.css'
import { Sidebar } from './Sidebar'
import { useIsPhone } from './useIsPhone'
import styles from './AppShell.module.css'

/** Sidebar plus content pane — the frame every screen renders inside. */
export function AppShell() {
  return useIsPhone() ? <PhoneShell /> : <DesktopShell />
}

function DesktopShell() {
  return (
    <div className={styles.shell}>
      <Sidebar />
      <main className={styles.pane}>
        <Outlet />
      </main>
    </div>
  )
}

/**
 * The same sidebar, hosted in a drawer instead of beside the page.
 *
 * A dialog rather than a panel slid in with CSS: this one covers the screen,
 * and a cover the page is still reachable behind by Tab is a decoration, not a
 * drawer. Radix brings the focus trap, Escape and the scroll lock.
 */
function PhoneShell() {
  const location = useLocation()
  const { isOpen: librarianOpen } = useLibrarian()
  const [openedAt, setOpenedAt] = useState<string | null>(null)

  // The drawer belongs to the page it was opened on. Whatever you picked in it,
  // you picked to see the page behind — and every navigation brings a new
  // location key, so the drawer is shut again without an effect watching for
  // it, and without a single row in the sidebar knowing a drawer exists.
  //
  // The librarian counts as picking something too, even though it navigates
  // nowhere: it opens a panel over the page instead, and closing that panel
  // should return you to the page rather than to the menu you had finished
  // with. That is only safe because the drawer is not modal — see below.
  const drawerOpen = openedAt === location.key && !librarianOpen

  return (
    <div className={styles.phoneShell}>
      <header className={styles.topBar}>
        {/* Not modal, and that is what lets the rule above close it safely. A modal Radix
            dialog puts `aria-hidden` on `#root` and takes it off again when it unmounts — but
            this one unmounts while the librarian's panel is over it, so the bookkeeping never
            balanced and the whole application stayed missing from the accessibility tree once
            that panel closed. Non-modal keeps the focus trap, Escape and the tap outside, and
            touches no `aria-hidden` at all. */}
        <Dialog.Root
          modal={false}
          open={drawerOpen}
          onOpenChange={(open) => setOpenedAt(open ? location.key : null)}
        >
          <Dialog.Trigger className={styles.menuButton}>
            <Icon name="list" size={20} />
            <span className={hidden.visuallyHidden}>Menu</span>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className={styles.drawerOverlay} />
            <Dialog.Content className={styles.drawer} aria-label="Main menu">
              <Sidebar />
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <span className={styles.wordmark}>libra</span>
      </header>

      <main className={styles.pane}>
        <Outlet />
      </main>
    </div>
  )
}
