/** "3 days ago", in the coarsest unit that is still true. */
export function relativeTime(when: string, now: Date = new Date()): string {
  const then = new Date(when)
  if (Number.isNaN(then.getTime())) return 'at an unknown time'

  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000)
  if (seconds < 60) return 'just now'

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return plural(minutes, 'minute')

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return plural(hours, 'hour')

  const days = Math.floor(hours / 24)
  if (days < 30) return plural(days, 'day')

  const months = Math.floor(days / 30)
  if (months < 12) return plural(months, 'month')

  return plural(Math.floor(days / 365), 'year')
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'} ago`
}
