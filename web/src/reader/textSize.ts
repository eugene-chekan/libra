import type { TextSize } from './BookReader'

const KEY = 'libra.textSize'
const SIZES: TextSize[] = ['small', 'medium', 'large']

/** The reader's stored preference, or medium when there is nothing usable. */
export function loadTextSize(): TextSize {
  try {
    const stored = localStorage.getItem(KEY)
    return SIZES.includes(stored as TextSize) ? (stored as TextSize) : 'medium'
  } catch {
    return 'medium'
  }
}

/** Remembers the preference for next time, and shrugs if storage is blocked. */
export function saveTextSize(size: TextSize): void {
  try {
    localStorage.setItem(KEY, size)
  } catch {
    // A reader with storage turned off still gets the size they picked, for this session.
  }
}
