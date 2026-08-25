import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { routes } from '../routes'
import { useSession } from './SessionProvider'

/** Guards a subtree of routes behind a live session. */
export function RequireSession() {
  const { status } = useSession()
  const location = useLocation()

  if (status.status === 'starting') return null

  if (status.status === 'signed-out') {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`${routes.login}?next=${next}`} replace />
  }

  return <Outlet />
}
