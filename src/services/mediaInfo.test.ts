import { describe, expect, it } from 'vitest'
import { fmtBytes, fmtMbps, parseDuration } from './mediaInfo'

describe('mediaInfo formatting', () => {
  it('reads the panel duration format and derives a bitrate', () => {
    expect(parseDuration('01:46:53')).toBe(6413)
    expect(parseDuration('bad')).toBeNull()
    expect(fmtMbps(1_711_000_000, 6413)).toBe('2.1 Mbps')
    expect(fmtBytes(1_711_000_000)).toBe('1.6 GB')
    expect(fmtBytes(299_000_000)).toBe('285 MB')
  })
})
