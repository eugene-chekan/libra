import { QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { ApiProvider } from './api/ApiProvider'
import { HttpLibraApi } from './api/HttpLibraApi'
import { createQueryClient } from './queryClient'
import { routes } from './routes'
import { AdminLayout } from './screens/AdminLayout'
import { AdminUsersScreen } from './screens/AdminUsersScreen'
import { BookScreen } from './screens/BookScreen'
import { LibraryScreen } from './screens/LibraryScreen'
import { ShelvesScreen } from './screens/ShelvesScreen'
import { LoginScreen } from './screens/LoginScreen'
import { RequireAdmin } from './session/RequireAdmin'
import { RequireSession } from './session/RequireSession'
import { SessionProvider } from './session/SessionProvider'
import { AppShell } from './shell/AppShell'
import { ChatScreen, NotFoundScreen, ReaderScreen } from './screens/screens'

/** The route table. */
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
          <Route element={<RequireAdmin />}>
            <Route element={<AdminLayout />}>
              <Route path={routes.admin} element={<Navigate to={routes.adminUsers} replace />} />
              <Route path={routes.adminUsers} element={<AdminUsersScreen />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFoundScreen />} />
        </Route>
      </Route>
    </Routes>
  )
}

/** Both clients are held in state so React creates each exactly once. */
export function App() {
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
