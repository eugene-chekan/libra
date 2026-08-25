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
  /** Sends the book. Rejects with the reason, which is printed under the row. */
  onSend: () => Promise<unknown>
  /** Opens the Kindle Email modal, which is where an address is set. */
  onSetUpAddress: () => void
}

type State = 'idle' | 'sending' | 'sent' | 'failed'

/**
 * Send to Kindle, and its five states.
 *
 * The only long-running action in the app, and the one most likely to fail for
 * reasons outside it: an address never set, an Amazon approval never granted,
 * a mail server that will not talk today. Each of those wants a different
 * sentence, so this has five states rather than a spinner and a shrug.
 *
 * **The failure reason comes from the server, word for word.** That is safe by
 * construction rather than by hope: the backend raises `SendFailedError` with a
 * message written to be shown, and keeps the mail server's own reply — which
 * quotes the username — in the log instead.
 *
 * "Sent" holds for a moment and then returns to idle: it is a confirmation,
 * not a resting state, and leaving it up would make the next send look as
 * though it had already happened. A failure returns to idle too, so the button
 * is usable straight away, with the reason under the row. When nothing else is
 * showing, "Last sent" answers the question a reader standing here actually
 * has — did I already send this?
 */
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
