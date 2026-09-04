import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { Appearance } from './BookReader'
import { AppearanceMenu } from './AppearanceMenu'

const VALUE: Appearance = { textSize: 'medium', width: 'medium' }

function renderMenu(value: Appearance = VALUE, onChange = vi.fn(), onClose = vi.fn()) {
  render(<AppearanceMenu value={value} onChange={onChange} onClose={onClose} />)
  return { onChange, onClose }
}

describe('AppearanceMenu', () => {
  it('offers three text sizes and three widths, in named groups', () => {
    // Both groups hold a "Medium", so the names are what tell them apart — for a screen reader
    // and for anything else asking which control it is looking at.
    renderMenu()

    const sizes = screen.getByRole('group', { name: 'Text size' })
    const widths = screen.getByRole('group', { name: 'Page width' })

    expect(within(sizes).getAllByRole('button')).toHaveLength(3)
    expect(within(widths).getAllByRole('button')).toHaveLength(3)
    expect(within(widths).getByRole('button', { name: 'Wide' })).toBeInTheDocument()
  })

  it('marks the choice in use in each group', () => {
    renderMenu({ textSize: 'large', width: 'narrow' })

    const sizes = screen.getByRole('group', { name: 'Text size' })
    const widths = screen.getByRole('group', { name: 'Page width' })

    expect(within(sizes).getByRole('button', { name: 'Large' })).toHaveAttribute(
      'aria-current',
      'true'
    )
    expect(within(widths).getByRole('button', { name: 'Narrow' })).toHaveAttribute(
      'aria-current',
      'true'
    )
    expect(within(widths).getByRole('button', { name: 'Medium' })).not.toHaveAttribute(
      'aria-current'
    )
  })

  it('reports a width change while keeping the text size', async () => {
    const { onChange } = renderMenu({ textSize: 'large', width: 'medium' })

    const widths = screen.getByRole('group', { name: 'Page width' })
    await userEvent.click(within(widths).getByRole('button', { name: 'Wide' }))

    expect(onChange).toHaveBeenCalledWith({ textSize: 'large', width: 'wide' })
  })

  it('reports a text size change while keeping the width', async () => {
    const { onChange } = renderMenu({ textSize: 'medium', width: 'wide' })

    const sizes = screen.getByRole('group', { name: 'Text size' })
    await userEvent.click(within(sizes).getByRole('button', { name: 'Small' }))

    expect(onChange).toHaveBeenCalledWith({ textSize: 'small', width: 'wide' })
  })

  it('closes on Escape', async () => {
    const { onClose } = renderMenu()

    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalled()
  })
})
