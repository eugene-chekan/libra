import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Modal, ModalFooter } from './Modal'

describe('Modal', () => {
  it('names the dialog with its title', () => {
    render(
      <Modal title="Manage Tags" width={440} onClose={vi.fn()}>
        <p>body</p>
      </Modal>
    )

    expect(screen.getByRole('dialog', { name: 'Manage Tags' })).toBeInTheDocument()
  })

  it('puts the subtitle on screen without making it the description', () => {
    // "6 tags" is a count. Announcing it as what the dialog is for would be
    // worse than announcing nothing.
    render(
      <Modal title="Manage Tags" subtitle="6 tags" width={440} onClose={vi.fn()}>
        <p>body</p>
      </Modal>
    )

    expect(screen.getByText('6 tags')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-describedby')
  })

  it('announces a description, when the dialog has one', () => {
    render(
      <Modal
        title="Delete Reading Now?"
        description="The books stay."
        width={420}
        onClose={vi.fn()}
      >
        <p>body</p>
      </Modal>
    )

    const dialog = screen.getByRole('dialog')
    const describedBy = dialog.getAttribute('aria-describedby')
    expect(describedBy).not.toBeNull()
    // The attribute has to name an element that is really there. This is
    // Radix's guarantee rather than the shell's, and the test is here so an
    // upgrade that broke it would be caught by us rather than by a reader
    // whose screen reader announces nothing.
    expect(document.getElementById(describedBy ?? '')).toHaveTextContent('The books stay.')
  })

  it('sets no aria-describedby when the dialog has no description', () => {
    render(
      <Modal title="Kindle Email" width={400} onClose={vi.fn()}>
        <p>body</p>
      </Modal>
    )

    // Not a dangling one: an id pointing at nothing is what makes a screen
    // reader promise a sentence and then announce silence.
    expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-describedby')
  })

  it('closes on Escape, so every dialog gets the same way out', async () => {
    const onClose = vi.fn()
    render(
      <Modal title="Manage Tags" width={440} onClose={onClose}>
        <p>body</p>
      </Modal>
    )

    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('takes its width from the dialog, since that is the one thing each decides', () => {
    render(
      <Modal title="Manage Shelves" width={460} onClose={vi.fn()}>
        <p>body</p>
      </Modal>
    )

    expect(screen.getByRole('dialog')).toHaveStyle({ width: '460px' })
  })
})

describe('ModalFooter', () => {
  it('keeps the shared row when a dialog adds spacing of its own', () => {
    // The bug this shape avoids: a dialog's own class replacing the shared
    // one, so its buttons quietly stop being pushed right.
    render(
      <Modal title="Manage Tags" width={440} onClose={vi.fn()}>
        <ModalFooter className="own-spacing">
          <button type="button">Close</button>
        </ModalFooter>
      </Modal>
    )

    const footer = screen.getByRole('button', { name: 'Close' }).parentElement
    expect(footer?.className).toContain('own-spacing')
    expect(footer?.className.split(' ').length).toBe(2)
  })
})
