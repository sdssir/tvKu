/** A subtitle cue with times in seconds. */
export interface Cue {
  start: number
  end: number
  text: string
}

const TIME_RE = /(\d+):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d+):(\d{2}):(\d{2})[,.](\d{1,3})/

function seconds(h: string, m: string, s: string, ms: string): number {
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms.padEnd(3, '0')) / 1000
}

/** Strip the markup subtitle files carry (`<i>`, `{\an8}`, SSA colour codes). */
function clean(line: string): string {
  return line
    .replace(/\{\\[^}]*\}/g, '')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim()
}

/**
 * SubRip parser. Tolerant of BOMs, CRLF, missing index lines and cues whose
 * text is empty; anything it cannot read is skipped rather than fatal.
 */
export function parseSrt(input: string): Cue[] {
  const text = input.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const cues: Cue[] = []
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split('\n')
    const timeIdx = lines.findIndex((l) => TIME_RE.test(l))
    if (timeIdx < 0) continue
    const m = lines[timeIdx]!.match(TIME_RE)!
    const start = seconds(m[1]!, m[2]!, m[3]!, m[4]!)
    const end = seconds(m[5]!, m[6]!, m[7]!, m[8]!)
    const body = lines
      .slice(timeIdx + 1)
      .map(clean)
      .filter(Boolean)
      .join('\n')
    if (!body || end <= start) continue
    cues.push({ start, end, text: body })
  }
  cues.sort((a, b) => a.start - b.start)
  return cues
}

/** The cue on screen at `t`, by binary search on start times. */
export function cueAt(cues: Cue[], t: number): Cue | null {
  let lo = 0
  let hi = cues.length - 1
  let best = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (cues[mid]!.start <= t) {
      best = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  // Overlapping cues are rare; walk back a couple in case an earlier one is still open.
  for (let i = best; i >= 0 && i > best - 3; i--) {
    const c = cues[i]!
    if (t >= c.start && t < c.end) return c
  }
  return null
}

/**
 * Index of the cue on screen at `t`, or of the next one to appear; -1 when
 * nothing comes after `t`. Used by the sync panel to keep its cursor on the
 * line the viewer is about to hear.
 */
export function nextCueIndex(cues: Cue[], t: number): number {
  let lo = 0
  let hi = cues.length - 1
  let best = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (cues[mid]!.end > t) {
      best = mid
      hi = mid - 1
    } else lo = mid + 1
  }
  return best
}
