import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '../api/errors'
import { TRANSIENT_CONFIRMATION_MS } from '../theme/durations'
import { KindleButton } from './KindleButton'

/** Everything unstated: an address is set, nothing was ever sent, sending works. */
function renderButton(props: Partial<Parameters<typeof KindleButton>[0]> = {}) {
  const onSend = props.onSend ?? vi.fn().mockResolvedValue(undefined)
  const onSetUpAddress = props.onSetUpAddress ?? vi.fn()
  render(
    <KindleButton
      hasAddress={props.hasAddress ?? true}
      lastSentAt={props.lastSentAt ?? null}
      onSend={onSend}
      onSetUpAddress={onSetUpAddress}
    />
  )
  return { onSend, onSetUpAddress }
}

describe('KindleButton', () => {
  it('sends when clicked', async () => {
    const user = userEvent.setup()
    const { onSend } = renderButton()

    await user.click(screen.getByRole('button', { name: /Send to Kindle/ }))

    expect(onSend).toHaveBeenCalled()
  })

  it('offers no send at all without an address, and links to where one is set', async () => {
    const user = userEvent.setup()
    const { onSetUpAddress } = renderButton({ hasAddress: false })

    expect(screen.getByRole('button', { name: /Send to Kindle/ })).toBeDisabled()
    expect(screen.getByText(/Add a Kindle address in/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'your account' }))
    expect(onSetUpAddress).toHaveBeenCalled()
  })

  it('says it is sending, and refuses a second click while it is', async () => {
    const user = userEvent.setup()
    let release: () => void = () => {}
    const onSend = vi.fn().mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve
      })
    )
    renderButton({ onSend })

    await user.click(screen.getByRole('button', { name: /Send to Kindle/ }))

    const sending = await screen.findByRole('button', { name: /Sending/ })
    expect(sending).toBeDisabled()

    release()
    await screen.findByRole('button', { name: /Sent/ })
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('holds the confirmation, then goes back to being ready to send again', async () => {
    // `fireEvent` rather than `userEvent` here: userEvent waits on real time
    // between its own steps, and this test has the clock frozen.
    vi.useFakeTimers()
    try {
      renderButton()

      fireEvent.click(screen.getByRole('button', { name: /Send to Kindle/ }))
      await act(async () => {})
      expect(screen.getByRole('button', { name: /Sent/ })).toBeInTheDocument()

      // The duration is imported, never retyped: a copy in this project had
      // already drifted to 2600 against 2500ms before anyone noticed.
      act(() => void vi.advanceTimersByTime(TRANSIENT_CONFIRMATION_MS))

      expect(screen.getByRole('button', { name: /Send to Kindle/ })).toBeEnabled()
    } finally {
      vi.useRealTimers()
    }
  })

  it("prints the server's reason for a failure, and stays usable", async () => {
    const user = userEvent.setup()
    const onSend = vi.fn().mockRejectedValue(new ApiError(502, 'the mail server refused it'))
    renderButton({ onSend })

    await user.click(screen.getByRole('button', { name: /Send to Kindle/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't send — the mail server refused it"
    )
    expect(screen.getByRole('button', { name: /Send to Kindle/ })).toBeEnabled()
  })

  it('answers "did I already send this?" when nothing else is showing', () => {
    const anHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    renderButton({ lastSentAt: anHourAgo })

    expect(screen.getByText('Last sent 1 hour ago')).toBeInTheDocument()
  })

  it('drops the last-sent line while a fresh send is being reported', async () => {
    const user = userEvent.setup()
    const anHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    renderButton({ lastSentAt: anHourAgo })

    await user.click(screen.getByRole('button', { name: /Send to Kindle/ }))

    await screen.findByRole('button', { name: /Sent/ })
    expect(screen.queryByText(/Last sent/)).not.toBeInTheDocument()
  })
})
