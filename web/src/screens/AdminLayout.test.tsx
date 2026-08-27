import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { routes } from '../routes'
import { AdminLayout } from './AdminLayout'

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={[routes.adminUsers]}>
      <Routes>
        <Route element={<AdminLayout />}>
          <Route path={routes.adminUsers} element={<div>Users tab content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe('AdminLayout', () => {
  it('shows the Admin heading and the Users tab, marked current', () => {
    renderLayout()

    expect(screen.getByRole('heading', { name: 'Admin', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('aria-current', 'page')
  })

  it("renders the active tab's content through the outlet", () => {
    renderLayout()

    expect(screen.getByText('Users tab content')).toBeInTheDocument()
  })
})
