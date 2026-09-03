import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { PageArrows } from './PageArrows'

describe('PageArrows', () => {
  it('turns forward and back', async () => {
    const onNext = vi.fn()
    const onPrevious = vi.fn()
    render(<PageArrows atStart={false} atEnd={false} onNext={onNext} onPrevious={onPrevious} />)

    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await userEvent.click(screen.getByRole('button', { name: 'Previous page' }))

    expect(onNext).toHaveBeenCalledOnce()
    expect(onPrevious).toHaveBeenCalledOnce()
  })

  it('disables the arrow that would do nothing', () => {
    // A control that looks live and does nothing is worse than one that says it cannot.
    render(<PageArrows atStart atEnd={false} onNext={vi.fn()} onPrevious={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled()
  })

  it('disables the forward arrow on the last page', () => {
    render(<PageArrows atStart={false} atEnd onNext={vi.fn()} onPrevious={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled()
  })
})
