import { useEffect, useRef, useState } from 'react'

import { messageFor } from '../api/errors'
import { TRANSIENT_CONFIRMATION_MS } from '../theme/durations'
import { Icon } from '../widgets/Icon'
import { relativeTime } from './relativeTime'
import buttons from './actionButtons.module.css'
import styles from './KindleButton.module.css'

interface KindleButtonProps {
  /** False when the reader has set no `kindle_email`. */
  hasAddress: boolean
  /** When this reader last sent this book, or null. */
  lastSentAt: string | null
  /** Sends the book. */
  onSend: () => Promise<unknown>
  /** Opens the Kindle Email modal, which is where an address is set. */
  onSetUpAddress: () => void
}

type State = 'idle' | 'sending' | 'sent' | 'failed'

/** Send to Kindle, and its five states. */
export function KindleButton({
  hasAddress,
  lastSentAt,
  onSend,
  onSetUpAddress,
}: KindleButtonProps) {
  const [state, setState] = useState<State>('idle')
  const [failure, setFailure] = useState<string | null>(null)
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (settle.current) clearTimeout(settle.current)
    }
  }, [])

  async function send() {
    setState('sending')
    setFailure(null)
    try {
      await onSend()
      setState('sent')
      settle.current = setTimeout(() => setState('idle'), TRANSIENT_CONFIRMATION_MS)
    } catch (error) {
      setState('failed')
      setFailure(messageFor(error))
    }
  }

  let button
  if (!hasAddress) {
    button = (
      <button type="button" className={buttons.outlined} disabled>
        <Icon name="send" size={14} />
        Send to Kindle
      </button>
    )
  } else if (state === 'sending') {
    button = (
      <button type="button" className={buttons.outlined} disabled>
        <span className={buttons.spinner} aria-hidden="true" />
        Sending…
      </button>
    )
  } else if (state === 'sent') {
    button = (
      <button type="button" className={`${buttons.outlined} ${styles.sent}`} disabled>
        <Icon name="check" size={14} />
        Sent
      </button>
    )
  } else {
    button = (
      <button type="button" className={buttons.outlined} onClick={() => void send()}>
        <Icon name="send" size={14} />
        Send to Kindle
      </button>
    )
  }

  let note = null
  if (!hasAddress) {
    note = (
      <p className={buttons.hint}>
        Add a Kindle address in{' '}
        {/* The fix is one click away, so the words take the reader there
            rather than describing where to go. */}
        <button type="button" className={buttons.link} onClick={onSetUpAddress}>
          your account
        </button>{' '}
        first.
      </p>
    )
  } else if (state === 'failed' && failure) {
    note = (
      <p className={buttons.failure} role="alert">
        Couldn&apos;t send — {failure}
      </p>
    )
  } else if (state === 'idle' && lastSentAt) {
    note = <p className={buttons.hint}>Last sent {relativeTime(lastSentAt)}</p>
  }

  return (
    <div className={styles.wrap}>
      {button}
      {note}
    </div>
  )
}
