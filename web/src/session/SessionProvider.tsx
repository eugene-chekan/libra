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
    // Every 401 reaches here, including a wrong password on the login screen
    // and the cold probe above — LibraApi.onUnauthorized fires for all of
    // them. This is the one place that can tell which of those actually ended
    // a *live* session: only a 401 that lands while `status` is `signed-in`
    // counts.
    //
    // Returning the same `EXPIRED` object every time, rather than a fresh
    // literal, is what makes this fire once under concurrency. Two 401s
    // discovered by two in-flight requests both call this; the first
    // transitions `signed-in` to `EXPIRED`, and the second sees `prev.status`
    // already `'signed-out'` and hands the identical object back. React skips
    // a state update when the value is unchanged by reference, so the second
    // call produces no re-render and no second redirect.
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
      // The server already considers the session gone. The client's job here
      // is to match that, not to report it.
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
