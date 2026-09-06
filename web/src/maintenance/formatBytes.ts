const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

/** A byte count a person can read: "1.4 MB", "812 KB", "0 B". */
export function formatBytes(bytes: number): string {
  let value = Math.max(0, bytes)
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  // Whole bytes are always whole; everything above gets one decimal, which is
  // as much precision as a maintenance page can act on.
  const shown = unit === 0 ? String(Math.round(value)) : value.toFixed(1)
  return `${shown} ${UNITS[unit]}`
}
