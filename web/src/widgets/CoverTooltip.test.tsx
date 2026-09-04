import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { CoverTooltip } from './CoverTooltip'

function renderCover() {
  const user = userEvent.setup()
  render(
    <CoverTooltip title="A Wizard of Earthsea" author="Ursula K. Le Guin">
      <img src="/cover.png" alt="A Wizard of Earthsea" />
    </CoverTooltip>
  )
  return { user, cover: screen.getByAltText('A Wizard of Earthsea') }
}

describe('CoverTooltip', () => {
  it('draws the cover it was given', () => {
    const { cover } = renderCover()

    expect(cover).toBeInTheDocument()
  })

  it('says nothing until the pointer is over the cover', () => {
    renderCover()

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('names the book and its author while the pointer is over the cover', async () => {
    const { user, cover } = renderCover()

    await user.hover(cover)

    const tooltip = await screen.findByRole('tooltip')
    expect(within(tooltip).getByText('A Wizard of Earthsea')).toBeInTheDocument()
    expect(within(tooltip).getByText('by Ursula K. Le Guin')).toBeInTheDocument()
  })

  it('goes away when the pointer leaves', async () => {
    const { user, cover } = renderCover()

    await user.hover(cover)
    await screen.findByRole('tooltip')
    await user.unhover(cover)

    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())
  })
})
