import { useApi } from '../api/ApiProvider'
import { useSession } from './SessionProvider'

/** Saves the signed-in reader's Kindle address, and keeps the session in step. */
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
