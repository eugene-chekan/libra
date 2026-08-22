import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { CollapsibleSection } from './CollapsibleSection'

describe('CollapsibleSection', () => {
  it('is open by default, per client-design.md', () => {
    render(
      <CollapsibleSection label="Shelves">
        <p>row one</p>
      </CollapsibleSection>
    )

    expect(screen.getByText('row one')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Shelves' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('collapses and expands on click', async () => {
    const user = userEvent.setup()
    render(
      <CollapsibleSection label="Shelves">
        <p>row one</p>
      </CollapsibleSection>
    )

    await user.click(screen.getByRole('button', { name: 'Shelves' }))
    expect(screen.queryByText('row one')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Shelves' })).toHaveAttribute(
      'aria-expanded',
      'false'
    )

    await user.click(screen.getByRole('button', { name: 'Shelves' }))
    expect(screen.getByText('row one')).toBeInTheDocument()
  })
})
