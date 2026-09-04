import type { Appearance, ReadingWidth, TextSize } from './BookReader'

const KEY = 'libra.reader.appearance'
const TEXT_SIZES: TextSize[] = ['small', 'medium', 'large']
const WIDTHS: ReadingWidth[] = ['narrow', 'medium', 'wide']

const DEFAULT: Appearance = { textSize: 'medium', width: 'medium' }

/** The reader's stored preference, or the default when there is nothing usable. */
export function loadAppearance(): Appearance {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (!stored || typeof stored !== 'object') return DEFAULT
    const { textSize, width } = stored as Partial<Appearance>
    return {
      textSize: TEXT_SIZES.includes(textSize as TextSize)
        ? (textSize as TextSize)
        : DEFAULT.textSize,
      width: WIDTHS.includes(width as ReadingWidth) ? (width as ReadingWidth) : DEFAULT.width,
    }
  } catch {
    return DEFAULT
  }
}

/** Remembers the preference for next time, and shrugs if storage is blocked. */
export function saveAppearance(appearance: Appearance): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(appearance))
  } catch {
    // A reader with storage turned off still gets what they picked, for this session.
  }
}
