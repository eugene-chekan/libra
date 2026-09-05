import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'

import { Tooltip } from './Tooltip'

function renderTooltip(label: ReactNode) {
  const user = userEvent.setup()
  render(
    <Tooltip label={label}>
      <button type="button">Shelves</button>
    </Tooltip>
  )
  return { user, trigger: screen.getByRole('button', { name: 'Shelves' }) }
}

describe('Tooltip', () => {
  it('says nothing until the pointer is over what it names', () => {
    renderTooltip('Shelves')

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('draws a plain string as one line', async () => {
    const { user, trigger } = renderTooltip('Shelves')

    await user.hover(trigger)

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Shelves')
  })

  it('draws a node as it comes, for a caller that wants more than a line', async () => {
    const { user, trigger } = renderTooltip(
      <>
        <span>Dune</span>
        <span>by Frank Herbert</span>
      </>
    )

    await user.hover(trigger)

    const card = await screen.findByRole('tooltip')
    expect(within(card).getByText('Dune')).toBeInTheDocument()
    expect(within(card).getByText('by Frank Herbert')).toBeInTheDocument()
  })

  it('goes when the pointer leaves', async () => {
    const { user, trigger } = renderTooltip('Shelves')

    await user.hover(trigger)
    await screen.findByRole('tooltip')
    await user.unhover(trigger)

    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())
  })
})
