import type { ReactNode } from 'react'

import styles from './CoverTooltip.module.css'
import { Tooltip } from './Tooltip'

interface CoverTooltipProps {
  title: string
  author: string
  /** The cover this names. */
  children: ReactNode
}

/**
 * A cover, with the book's title and author while the pointer is over it.
 *
 * A cover on its own often does not say which book it is: a shelf row draws them 96px wide with
 * no words at all, and the library grid cuts a long title at two lines.
 */
export function CoverTooltip({ title, author, children }: CoverTooltipProps) {
  return (
    <Tooltip
      label={
        <>
          <span className={styles.title}>{title}</span>
          <span className={styles.author}>by {author}</span>
        </>
      }
    >
      {children}
    </Tooltip>
  )
}
