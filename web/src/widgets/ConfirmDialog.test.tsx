import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ConfirmDialog } from './ConfirmDialog'

function renderDialog(overrides: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const props = {
    title: 'Delete Reading Now?',
    message: 'The shelf goes; the books on it stay in your library.',
    confirmLabel: 'Delete',
    onConfirm: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }
  render(<ConfirmDialog {...props} />)
  return props
}

describe('ConfirmDialog', () => {
  it('asks the question and says what survives', () => {
    renderDialog()

    expect(screen.getByRole('dialog', { name: 'Delete Reading Now?' })).toBeInTheDocument()
    expect(screen.getByText(/the books on it stay in your library/i)).toBeInTheDocument()
  })

  it('names the action on the button rather than saying OK', () => {
    renderDialog()

    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'OK' })).not.toBeInTheDocument()
  })

  it('goes ahead only when the reader says so', async () => {
    const user = userEvent.setup()
    const { onConfirm, onClose } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onConfirm).toHaveBeenCalled()
  })

  it('closes on Escape, so the destructive path is never a trap', async () => {
    const user = userEvent.setup()
    const { onClose, onConfirm } = renderDialog()

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
