import * as Radix from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'

import styles from './Tooltip.module.css'

interface TooltipProps {
  /** What the card says. A string is drawn as one plain line; a node is drawn as it comes. */
  label: ReactNode
  /** Which side of the thing it names. */
  side?: 'top' | 'right' | 'bottom' | 'left'
  /** What the pointer has to be over. */
  children: ReactNode
}

/**
 * A small card naming whatever the pointer is over.
 *
 * Radix wants its provider at the root of the application. It is here instead so that anything
 * wrapped in this carries its own tooltip wherever it is put, and no test that draws one has to
 * know this exists. The cost is small: each one waits out its own delay rather than a row
 * sharing one.
 *
 * A screen reader is told none of this, and needs none of it. Radix hangs the card off the span
 * below, which is not focusable and holds no meaning, so nothing ever lands on it — and every
 * caller so far names its trigger properly by other means.
 *
 * The card holds nothing to reach — no link, nothing to select — so `disableHoverableContent`
 * takes it away the moment the pointer leaves, rather than keeping it up while the pointer
 * travels towards it.
 */
export function Tooltip({ label, side = 'top', children }: TooltipProps) {
  return (
    <Radix.Provider delayDuration={150} disableHoverableContent>
      <Radix.Root>
        <Radix.Trigger asChild>
          <span className={styles.anchor}>{children}</span>
        </Radix.Trigger>
        {/* At the end of the page, not inside whatever it names: a card is not part of what you
            click, and out there nothing drawn later can be painted over it. */}
        <Radix.Portal>
          <Radix.Content className={styles.card} side={side} sideOffset={8} collisionPadding={12}>
            {typeof label === 'string' ? <span className={styles.label}>{label}</span> : label}
          </Radix.Content>
        </Radix.Portal>
      </Radix.Root>
    </Radix.Provider>
  )
}
