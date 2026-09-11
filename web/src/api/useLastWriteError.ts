import { useState } from 'react'

/** What a write passes to `mutate`, so its result replaces the error on screen. */
export interface SettleOptions {
  onSuccess: () => void
  onError: (error: Error) => void
}

/**
 * The error of the write that settled last. A TanStack Query mutation keeps its own error until
 * that same mutation runs again, so on a screen with several writes an old refusal would
 * otherwise stay on screen after a later write succeeds.
 */
export function useLastWriteError(): {
  error: Error | null
  /** Options for one `mutate` call; `onSuccess` runs after the error is cleared. */
  settle: (onSuccess?: () => void) => SettleOptions
  clear: () => void
} {
  const [error, setError] = useState<Error | null>(null)
  return {
    error,
    settle: (onSuccess) => ({
      onSuccess: () => {
        setError(null)
        onSuccess?.()
      },
      onError: (failure) => setError(failure),
    }),
    clear: () => setError(null),
  }
}
