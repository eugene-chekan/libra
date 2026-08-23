import { describe, expect, it } from 'vitest'

import { relativeTime } from './relativeTime'

const now = new Date('2026-08-23T12:00:00Z')

/** Builds a timestamp `seconds` before {@link now}, so no test does its own arithmetic. */
function ago(seconds: number): string {
  return new Date(now.getTime() - seconds * 1000).toISOString()
}

const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe('relativeTime', () => {
  it('says "just now" for anything under a minute', () => {
    expect(relativeTime(ago(0), now)).toBe('just now')
    expect(relativeTime(ago(59), now)).toBe('just now')
  })

  it('counts in the coarsest unit that is still true', () => {
    expect(relativeTime(ago(MINUTE), now)).toBe('1 minute ago')
    expect(relativeTime(ago(5 * MINUTE), now)).toBe('5 minutes ago')
    expect(relativeTime(ago(HOUR), now)).toBe('1 hour ago')
    expect(relativeTime(ago(3 * DAY), now)).toBe('3 days ago')
    expect(relativeTime(ago(45 * DAY), now)).toBe('1 month ago')
    expect(relativeTime(ago(400 * DAY), now)).toBe('1 year ago')
  })

  it('rounds down rather than up, so it never claims more time than has passed', () => {
    expect(relativeTime(ago(2 * HOUR - 1), now)).toBe('1 hour ago')
  })

  it('reads a future timestamp as just now, rather than counting backwards', () => {
    // Two clocks a few seconds apart is ordinary. "in -3 seconds" is not.
    expect(relativeTime(ago(-30), now)).toBe('just now')
  })

  it('says so plainly when the timestamp cannot be read', () => {
    expect(relativeTime('not a date', now)).toBe('at an unknown time')
  })
})
