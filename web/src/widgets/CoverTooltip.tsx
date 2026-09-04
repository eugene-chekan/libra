import * as Tooltip from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'

import styles from './CoverTooltip.module.css'

interface CoverTooltipProps {
  title: string
  author: string
  /** The cover this names. */
  children: ReactNode
}

/**
 * A cover, with the book's title and author while the pointer is over it.
 *
 * Radix wants its provider at the root of the application. It is here instead so that a cover
 * carries its own tooltip wherever it is put, and no test that draws one has to know this
 * exists. The cost is small: each cover waits out its own delay rather than the row sharing one.
 *
 * A screen reader is told none of this, and needs none of it. Radix hangs the card off the span
 * below, which is not focusable and holds no meaning, so nothing ever lands on it — while the
 * shelf link is already named "title by author" and the library cell already prints both.
 *
 * The card holds nothing to reach — no link, nothing to select — so `disableHoverableContent`
 * takes it away the moment the pointer leaves the cover, rather than keeping it up while the
 * pointer travels towards it.
 */
export function CoverTooltip({ title, author, children }: CoverTooltipProps) {
  return (
    <Tooltip.Provider delayDuration={150} disableHoverableContent>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span className={styles.anchor}>{children}</span>
        </Tooltip.Trigger>
        {/* At the end of the page, not inside the link the cover is: a card is not part of what
            you click, and out there nothing drawn later can be painted over it. */}
        <Tooltip.Portal>
          <Tooltip.Content className={styles.card} side="top" sideOffset={8} collisionPadding={12}>
            <span className={styles.title}>{title}</span>
            <span className={styles.author}>by {author}</span>
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}
