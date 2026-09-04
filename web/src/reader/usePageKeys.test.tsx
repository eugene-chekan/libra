import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { usePageKeys } from './usePageKeys'

function Harness({
  onPrevious,
  onNext,
  enabled = true,
}: {
  onPrevious: () => void
  onNext: () => void
  enabled?: boolean
}) {
  usePageKeys(onPrevious, onNext, enabled)
  return <input aria-label="Somewhere to type" />
}

describe('usePageKeys', () => {
  it('turns pages with the arrow keys, Page Up and Page Down, and Space', async () => {
    const onNext = vi.fn()
    const onPrevious = vi.fn()
    render(<Harness onNext={onNext} onPrevious={onPrevious} />)

    await userEvent.keyboard('{ArrowRight}{PageDown}{ }')
    await userEvent.keyboard('{ArrowLeft}{PageUp}')

    expect(onNext).toHaveBeenCalledTimes(3)
    expect(onPrevious).toHaveBeenCalledTimes(2)
  })

  it('leaves typing alone', async () => {
    // The librarian panel has a text box. Space there is a space, not a page turn.
    const onNext = vi.fn()
    render(<Harness onNext={onNext} onPrevious={vi.fn()} />)

    await userEvent.click(screen.getByRole('textbox', { name: 'Somewhere to type' }))
    await userEvent.keyboard('a b')

    expect(onNext).not.toHaveBeenCalled()
  })

  it('leaves browser shortcuts alone', async () => {
    // Ctrl-Right is "next word" and the browser's own; it is not a page turn.
    const onNext = vi.fn()
    render(<Harness onNext={onNext} onPrevious={vi.fn()} />)

    await userEvent.keyboard('{Control>}{ArrowRight}{/Control}')

    expect(onNext).not.toHaveBeenCalled()
  })

  it('does nothing while the book is not ready', async () => {
    const onNext = vi.fn()
    render(<Harness onNext={onNext} onPrevious={vi.fn()} enabled={false} />)

    await userEvent.keyboard('{ArrowRight}')

    expect(onNext).not.toHaveBeenCalled()
  })
})
