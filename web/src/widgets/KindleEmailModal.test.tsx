import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '../api/errors'
import { checkKindleEmail, KindleEmailModal } from './KindleEmailModal'

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

  it('refuses an address that is not an e-mail address, and saves nothing', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<KindleEmailModal currentEmail={null} onSave={onSave} onClose={vi.fn()} />)

    await user.type(screen.getByLabelText(/send-to-kindle address/i), 'reader at kindle')
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/not an e-mail address/i)
    expect(screen.getByLabelText(/send-to-kindle address/i)).toHaveAttribute('aria-invalid', 'true')
  })

  it('stays open and says why when the server refuses the save', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockRejectedValue(new ApiError(0, 'Could not reach the server.'))
    const onClose = vi.fn()
    render(<KindleEmailModal currentEmail={null} onSave={onSave} onClose={onClose} />)

    await user.type(screen.getByLabelText(/send-to-kindle address/i), 'reader_zz9@kindle.com')
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server.')
    expect(screen.getByRole('dialog', { name: /kindle email/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save/i })).toBeEnabled()
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

describe('checkKindleEmail', () => {
  it.each(['reader_a1b2c3@kindle.com', '  reader@kindle.com  ', ''])('accepts %j', (email) => {
    expect(checkKindleEmail(email)).toBeNull()
  })

  it.each(['reader', 'reader@kindle', '@kindle.com', 'reader@', 'two words@kindle.com'])(
    'refuses %j',
    (email) => {
      expect(checkKindleEmail(email)).toMatch(/not an e-mail address/)
    }
  )
})
