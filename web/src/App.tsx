import { QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { createQueryClient } from './queryClient'
import { routes } from './routes'
import { AppShell } from './shell/AppShell'
import { ChatScreen, LibraryScreen, NotFoundScreen, ShelvesScreen } from './screens/screens'

/**
 * The route table.
 *
 * Split out from {@link App} so tests can mount it inside a `MemoryRouter` at
 * whichever path they are exercising, without a second copy of the routes to
 * drift from this one.
 *
 * `/` redirects to the library rather than rendering it, so the library has
 * exactly one address. The Flutter client made the same move for the same
 * reason: with the grid at `/library`, a filter can live in the query string,
 * which makes a filtered view linkable, survive a reload, and come back with
 * the back button — and leaves the screen holding no filter state of its own.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Navigate to={routes.library} replace />} />
        <Route path={routes.library} element={<LibraryScreen />} />
        <Route path={routes.shelves} element={<ShelvesScreen />} />
        <Route path={routes.chat} element={<ChatScreen />} />
        <Route path="*" element={<NotFoundScreen />} />
      </Route>
    </Routes>
  )
}

export function App() {
  // Held in state so React creates it once. A client built during render would
  // be rebuilt on every render and throw the cache away each time.
  const [queryClient] = useState(createQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
