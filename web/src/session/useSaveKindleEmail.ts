import { useApi } from '../api/ApiProvider'
import { useSession } from './SessionProvider'

/**
 * Saves the signed-in reader's Kindle address, and keeps the session in step.
 *
 * Two screens open the Kindle Email modal — the sidebar's account menu, and
 * the Send to Kindle button when no address is set — and both then have to
 * write the same field on the same user and tell `SessionProvider` about it.
 * That is one decision, so it lives in one place rather than being written out
 * twice and drifting the first time the call changes.
 *
 * Throws when nobody is signed in. The modal is only reachable from inside
 * `RequireSession`, so that is a bug rather than a state to handle.
 */
export function useSaveKindleEmail(): (email: string | null) => Promise<void> {
  const api = useApi()
  const { status, setUser } = useSession()

  return async (email: string | null) => {
    if (status.status !== 'signed-in') {
      throw new Error('Cannot save a Kindle address while signed out')
    }
    const updated = await api.updateUser(status.user.id, { kindle_email: email })
    setUser(updated)
  }
}
