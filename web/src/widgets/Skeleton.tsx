import { useEffect, useState, type CSSProperties } from 'react'

import { SKELETON_DELAY_MS } from '../theme/durations'
import styles from './Skeleton.module.css'

/**
 * Skeletons, not spinners, for content that is arriving.
 *
 * client-design.md settles this once for the whole app: spinners are only for
 * an action the reader started, and only inside the control that started it.
 * Inventing a loading state per screen is how an application ends up with four
 * spinners and three error shapes.
 *
 * Everything here is decoration and is hidden from assistive technology. The
 * accessible signal that something is loading belongs to the region that is
 * waiting, which announces it once — a dozen pulsing boxes announcing
 * themselves individually is noise, not information.
 */

interface SkeletonProps {
  width?: string
  height?: string
  className?: string
}

export function Skeleton({ width, height, className }: SkeletonProps) {
  const style: CSSProperties = {}
  if (width !== undefined) style.width = width
  if (height !== undefined) style.height = height

  return (
    <div
      className={className ? `${styles.block} ${className}` : styles.block}
      style={style}
      aria-hidden="true"
    />
  )
}

/**
 * Delays its children by {@link SKELETON_DELAY_MS}.
 *
 * Wraps the loading region rather than each block, because the delay belongs
 * to the wait as a whole. Returns nothing at all until the delay has passed,
 * so a fast response renders no skeleton and the reader sees one transition
 * instead of two.
 */
export function SkeletonDelay({ children }: { children: React.ReactNode }) {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setShown(true), SKELETON_DELAY_MS)
    return () => clearTimeout(timer)
  }, [])

  if (!shown) return null
  return <>{children}</>
}

/** The library grid's loading state: twelve cells at the real cell geometry. */
export function SkeletonGrid({ cells = 12 }: { cells?: number }) {
  return (
    <div className={styles.grid} aria-hidden="true">
      {Array.from({ length: cells }, (_, i) => (
        <div key={i} className={styles.cell}>
          <Skeleton className={styles.cover} />
          <Skeleton height="13px" width="80%" />
          <Skeleton height="12px" width="50%" />
        </div>
      ))}
    </div>
  )
}

/** A list's loading state — shelves, tags, users. Three rows at the real height. */
export function SkeletonRows({ rows = 3, height = '44px' }: { rows?: number; height?: string }) {
  return (
    <div className={styles.rows} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={height} />
      ))}
    </div>
  )
}
