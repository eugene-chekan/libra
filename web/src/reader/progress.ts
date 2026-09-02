import type { ReaderPosition } from './BookReader'

/** Where the reader is, as the 0-to-1 float the server stores. */
export function toProgress(position: ReaderPosition, chapterCount: number): number {
  if (chapterCount <= 0) return 0
  return Math.min(1, (position.index + position.fraction) / chapterCount)
}

/**
 * The stored float, back into a chapter and how far down it. Lossy on purpose: it returns the
 * right place in the right chapter, not the right sentence.
 */
export function toPosition(progress: number, chapterCount: number): ReaderPosition {
  if (chapterCount <= 0) return { index: 0, fraction: 0 }
  const exact = Math.min(progress, 1) * chapterCount
  const index = Math.min(Math.floor(exact), chapterCount - 1)
  return { index, fraction: Math.min(1, exact - index) }
}
