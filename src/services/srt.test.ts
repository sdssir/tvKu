import { describe, expect, it } from 'vitest'
import { cueAt, nextCueIndex, parseSrt } from './srt'

const SAMPLE = `﻿1\r\n00:00:01,000 --> 00:00:02,500\r\n<i>Hello</i> there\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\n{\\an8}Top line\r\nsecond line\r\n\r\n\r\n3\r\n00:00:05,000 --> 00:00:04,000\r\nbackwards, skipped\r\n\r\n00:01:00.200 --> 00:01:01.000\r\nno index line\r\n`

describe('parseSrt', () => {
  it('reads cues, strips markup and drops broken blocks', () => {
    const cues = parseSrt(SAMPLE)
    expect(cues).toEqual([
      { start: 1, end: 2.5, text: 'Hello there' },
      { start: 3, end: 4, text: 'Top line\nsecond line' },
      { start: 60.2, end: 61, text: 'no index line' },
    ])
  })
  it('returns nothing for garbage', () => {
    expect(parseSrt('not a subtitle file')).toEqual([])
  })
})

describe('cueAt', () => {
  const cues = parseSrt(SAMPLE)
  it('finds the cue covering a time and nothing in the gaps', () => {
    expect(cueAt(cues, 1.5)?.text).toBe('Hello there')
    expect(cueAt(cues, 2.7)).toBeNull()
    expect(cueAt(cues, 3.99)?.text).toBe('Top line\nsecond line')
    expect(cueAt(cues, 0)).toBeNull()
    expect(cueAt([], 5)).toBeNull()
  })
})

describe('nextCueIndex', () => {
  const cues = parseSrt(SAMPLE)
  it('returns the cue on screen, else the next one, else -1', () => {
    expect(nextCueIndex(cues, 1.5)).toBe(0) // on screen
    expect(nextCueIndex(cues, 2.7)).toBe(1) // in the gap: the upcoming one
    expect(nextCueIndex(cues, 0)).toBe(0)
    expect(nextCueIndex(cues, 61)).toBe(-1)
    expect(nextCueIndex([], 5)).toBe(-1)
  })
})
