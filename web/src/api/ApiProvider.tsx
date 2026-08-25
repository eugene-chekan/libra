import { createContext, useContext, type ReactNode } from 'react'

import type { LibraApi } from './LibraApi'

const ApiContext = createContext<LibraApi | null>(null)

/** Hands one API client to the whole application. */
export function ApiProvider({ api, children }: { api: LibraApi; children: ReactNode }) {
  return <ApiContext value={api}>{children}</ApiContext>
}

/** The API client. */
export function useApi(): LibraApi {
  const api = useContext(ApiContext)
  if (!api) throw new Error('useApi must be used inside an ApiProvider')
  return api
}
