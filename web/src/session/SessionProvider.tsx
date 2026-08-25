import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

import { useApi } from '../api/ApiProvider'
import type { User } from '../api/types'

/** Where the client stands with the server, as one value. */
export type SessionStatus =
  | { status: 'starting' }
  | { status: 'signed-out'; reason: 'expired' | null }
  | { status: 'signed-in'; user: User }

interface Session {
  status: SessionStatus
  /** `POST /api/auth/login`, then signed-in on success. */
  login: (username: string, password: string) => Promise<void>
  /** `POST /api/auth/logout`, then signed-out with no reason either way. */
  signOut: () => Promise<void>
  /** Replaces the signed-in user, for a screen that just changed one of its fields. */
  setUser: (user: User) => void
}

/**
 * Every 401 the client sees reaches `setOnUnauthorized`, including a wrong password on the
 * login screen and the cold probe.
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
