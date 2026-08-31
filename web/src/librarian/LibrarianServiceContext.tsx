import { createContext, useContext, type ReactNode } from 'react'

import type { LibrarianService } from './LibrarianService'

const LibrarianServiceContext = createContext<LibrarianService | null>(null)

/** Hands one librarian service to the whole application. */
export function LibrarianServiceProvider({
  service,
  children,
}: {
  service: LibrarianService
  children: ReactNode
}) {
  return <LibrarianServiceContext value={service}>{children}</LibrarianServiceContext>
}

/** The librarian service. */
export function useLibrarianService(): LibrarianService {
  const service = useContext(LibrarianServiceContext)
  if (!service)
    throw new Error('useLibrarianService must be used inside a LibrarianServiceProvider')
  return service
}
