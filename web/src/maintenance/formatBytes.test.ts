import { describe, expect, it } from 'vitest'

import { formatBytes } from './formatBytes'

describe('formatBytes', () => {
  it('leaves small counts as whole bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(999)).toBe('999 B')
  })

  it('steps up a unit at a time', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1024 * 1024 * 1.5)).toBe('1.5 MB')
    expect(formatBytes(1024 ** 3)).toBe('1.0 GB')
  })

  it('stops at the largest unit it knows rather than inventing one', () => {
    expect(formatBytes(1024 ** 6)).toBe('1048576.0 TB')
  })

  it('treats a negative count as nothing, since a directory cannot hold less than nothing', () => {
    expect(formatBytes(-5)).toBe('0 B')
  })
})
