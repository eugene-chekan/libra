import { QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { ApiProvider } from './api/ApiProvider'
import { HttpLibraApi } from './api/HttpLibraApi'
import { createQueryClient } from './queryClient'
import { routes } from './routes'
import { BookScreen } from './screens/BookScreen'
import { LibraryScreen } from './screens/LibraryScreen'
import { ShelvesScreen } from './screens/ShelvesScreen'
import { LoginScreen } from './screens/LoginScreen'
import { RequireSession } from './session/RequireSession'
import { SessionProvider } from './session/SessionProvider'
import { AppShell } from './shell/AppShell'
import { ChatScreen, NotFoundScreen, ReaderScreen } from './screens/screens'

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
      <Route path={routes.login} element={<LoginScreen />} />
      <Route element={<RequireSession />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to={routes.library} replace />} />
          <Route path={routes.library} element={<LibraryScreen />} />
          <Route path={routes.book} element={<BookScreen />} />
          <Route path={routes.reader} element={<ReaderScreen />} />
          <Route path={routes.shelves} element={<ShelvesScreen />} />
          <Route path={routes.chat} element={<ChatScreen />} />
          <Route path="*" element={<NotFoundScreen />} />
        </Route>
      </Route>
    </Routes>
  )
}

export function App() {
  // Held in state so React creates each once. Built during render, either
  // would be rebuilt every render — the query client would throw its cache
  // away each time, and the API client would drop `onUnauthorized` between
  // renders since a new instance never has SessionProvider's listener on it.
  const [queryClient] = useState(createQueryClient)
  const [api] = useState(() => new HttpLibraApi())

  return (
    <QueryClientProvider client={queryClient}>
      <ApiProvider api={api}>
        <BrowserRouter>
          <SessionProvider>
            <AppRoutes />
          </SessionProvider>
        </BrowserRouter>
      </ApiProvider>
    </QueryClientProvider>
  )
}
