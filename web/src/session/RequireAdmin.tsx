import { Navigate, Outlet } from 'react-router-dom'

import { routes } from '../routes'
import { useSession } from './SessionProvider'

/**
 * Guards a subtree behind an admin session. Nests inside `RequireSession`'s
 * own subtree in the route table, so by the time this renders a session is
 * already known — the `starting` and `signed-out` branches below are a
 * defensive fallback for this component's own contract, not the path it is
 * actually reached through.
 */
export function RequireAdmin() {
  const { status } = useSession()

  if (status.status === 'starting') return null
  if (status.status !== 'signed-in' || !status.user.is_admin) {
    return <Navigate to={routes.library} replace />
  }

  return <Outlet />
}
