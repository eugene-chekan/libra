import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { routes } from '../routes'
import { useSession } from './SessionProvider'

/**
 * Guards a subtree of routes behind a live session.
 *
 * Renders nothing while the session is `starting` — not the login screen,
 * and not the protected route either, since both would be a guess at an
 * answer that has not arrived yet. The Flutter build of this milestone had to
 * route through a dedicated `/starting` URL to avoid exactly this flash,
 * because its router tore down and rebuilt a navigator stack on every route
 * change. React's render tree has no equivalent stack to churn: rendering
 * nothing here, at this address, is already the fix.
 */
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
