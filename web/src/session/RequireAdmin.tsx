import { Navigate, Outlet } from 'react-router-dom'

import { routes } from '../routes'
import { useSession } from './SessionProvider'

/** Guards a subtree of routes behind an admin session. */
export function RequireAdmin() {
  const { status } = useSession()

  if (status.status === 'starting') return null
  if (status.status !== 'signed-in' || !status.user.is_admin) {
    return <Navigate to={routes.library} replace />
  }

  return <Outlet />
}
