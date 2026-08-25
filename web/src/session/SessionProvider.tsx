import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

import { useApi } from '../api/ApiProvider'
import type { User } from '../api/types'

/**
 * Where the client stands with the server, as one value.
 *
 * `starting` is the cold-load window: the client has asked `GET /auth/me` but
 * does not have an answer yet. A route guard renders nothing rather than
 * either the login screen or a protected screen during this window, because
 * both would be a guess at an answer nobody has yet.
 *
 * `signed-out` carries a `reason`. `null` means there was never a session to
 * lose — the cold probe found nothing, or the reader chose to sign out.
 * `'expired'` means a session was live and a request just found out it is
 * not, which is the one case the login screen explains. Reading the reason
 * off this value rather than off the `?next=` query string is deliberate: the
 * Flutter build of this milestone inferred it from `next` and got it wrong in
 * both directions — a shared link carried `next` and falsely claimed a
 * session had ended, and an expiry with nowhere to redirect back to carried
 * no `next` and said nothing at all.
 */
export type SessionStatus =
  | { status: 'starting' }
  | { status: 'signed-out'; reason: 'expired' | null }
  | { status: 'signed-in'; user: User }

interface Session {
  status: SessionStatus
  /** `POST /api/auth/login`, then signed-in on success. Throws on failure. */
  login: (username: string, password: string) => Promise<void>
  /** `POST /api/auth/logout`, then signed-out with no reason either way. */
  signOut: () => Promise<void>
  /** Replaces the signed-in user, for a screen that just changed one of its fields. */
  setUser: (user: User) => void
}

/**
 * Every 401 the client sees reaches `setOnUnauthorized`, including a wrong
 * password on the login screen and the cold probe. Only one of those ended a
 * *live* session, which is why the handler below transitions from `signed-in`
 * and leaves every other state alone.
 *
 * `EXPIRED` and the other two are module constants rather than fresh literals,
 * and that is what makes an expiry fire once under concurrency: two in-flight
 * requests both discovering a 401 both call the handler, the first moves
 * `signed-in` to `EXPIRED`, and the second hands back the identical object.
 * React skips a state update when the value is unchanged by reference, so the
 * second produces no re-render and no second redirect.
 */
const SessionContext = createContext<Session | null>(null)

const STARTING: SessionStatus = { status: 'starting' }
const SIGNED_OUT: SessionStatus = { status: 'signed-out', reason: null }
const EXPIRED: SessionStatus = { status: 'signed-out', reason: 'expired' }

export function SessionProvider({ children }: { children: ReactNode }) {
  const api = useApi()
  const [status, setStatus] = useState<SessionStatus>(STARTING)

  useEffect(() => {
    let cancelled = false
    api.me().then(
      (user) => {
        if (!cancelled) setStatus({ status: 'signed-in', user })
      },
      () => {
        if (!cancelled) setStatus(SIGNED_OUT)
      }
    )
    return () => {
      cancelled = true
    }
  }, [api])

  useEffect(() => {
    api.setOnUnauthorized(() => {
      setStatus((prev) => (prev.status === 'signed-in' ? EXPIRED : prev))
    })
    return () => {
      api.setOnUnauthorized(null)
    }
  }, [api])

  const login = async (username: string, password: string) => {
    const user = await api.login(username, password)
    setStatus({ status: 'signed-in', user })
  }

  const signOut = async () => {
    try {
      await api.logout()
    } catch {
      // The server already considers the session gone; matching it is the job.
    }
    setStatus(SIGNED_OUT)
  }

  const setUser = (user: User) => setStatus({ status: 'signed-in', user })

  return <SessionContext value={{ status, login, signOut, setUser }}>{children}</SessionContext>
}

export function useSession(): Session {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession must be used inside a SessionProvider')
  return session
}
