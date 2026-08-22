import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { KindleEmailModal } from './KindleEmailModal'

describe('KindleEmailModal', () => {
  it('prefills the field from the current address', () => {
    render(
      <KindleEmailModal
        currentEmail="reader_a1b2c3@kindle.com"
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByLabelText(/send-to-kindle address/i)).toHaveValue('reader_a1b2c3@kindle.com')
  })

  it('starts blank when there is no address yet', () => {
    render(<KindleEmailModal currentEmail={null} onSave={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByLabelText(/send-to-kindle address/i)).toHaveValue('')
  })

  it('names the whole point of the address: Amazon rejects mail from senders not on the approved list', () => {
    render(<KindleEmailModal currentEmail={null} onSave={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByText(/approved personal document e-mail list/i)).toBeInTheDocument()
  })

  it('saves the typed address', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<KindleEmailModal currentEmail={null} onSave={onSave} onClose={vi.fn()} />)

    await user.type(screen.getByLabelText(/send-to-kindle address/i), 'reader_zz9@kindle.com')
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(onSave).toHaveBeenCalledWith('reader_zz9@kindle.com')
  })

  it('saves null when the field is cleared, not an empty string', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<KindleEmailModal currentEmail="old@kindle.com" onSave={onSave} onClose={vi.fn()} />)

    await user.clear(screen.getByLabelText(/send-to-kindle address/i))
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(onSave).toHaveBeenCalledWith(null)
  })

  it('closes without saving on Cancel', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    const onClose = vi.fn()
    render(<KindleEmailModal currentEmail="old@kindle.com" onSave={onSave} onClose={onClose} />)

    await user.type(screen.getByLabelText(/send-to-kindle address/i), 'x')
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(onSave).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('is a real dialog, labelled by its own heading', () => {
    render(<KindleEmailModal currentEmail={null} onSave={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: /kindle email/i })).toBeInTheDocument()
  })
})
