import { createContext, useContext, type ReactNode } from 'react'

import type { LibraApi } from './LibraApi'

const ApiContext = createContext<LibraApi | null>(null)

/**
 * Hands one API client to the whole application.
 *
 * This is where the swap happens: the app passes `HttpLibraApi`, a test passes
 * `FakeLibraApi`, and nothing in between changes. No screen ever imports
 * either class, which is what keeps the seam a seam.
 */
export function ApiProvider({ api, children }: { api: LibraApi; children: ReactNode }) {
  return <ApiContext value={api}>{children}</ApiContext>
}

/** The API client. Throws if used outside the provider, which is a wiring bug. */
export function useApi(): LibraApi {
  const api = useContext(ApiContext)
  if (!api) throw new Error('useApi must be used inside an ApiProvider')
  return api
}
