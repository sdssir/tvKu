import { describe, expect, it } from 'vitest'
import { bestIn, type Rect } from './useTvNavigation'

const box = (id: string, left: number, top: number, w = 100, h = 50) => ({
  id,
  rect: { left, top, width: w, height: h, right: left + w, bottom: top + h } as Rect,
})

describe('bestIn', () => {
  const origin = box('o', 0, 0).rect
  it('prefers the same lane over a closer diagonal', () => {
    const far = box('far', 400, 10)
    const diag = box('diag', 120, 200)
    expect(bestIn('right', origin, [far, diag])?.id).toBe('far')
  })
  it('returns null when nothing lies in that direction', () => {
    expect(bestIn('left', origin, [box('r', 200, 0)])).toBeNull()
  })
  it('prefers the same region within a lane', () => {
    const near = box('near', 150, 0)
    const local = box('local', 300, 0)
    expect(bestIn('right', origin, [near, local], (c) => c.id === 'local')?.id).toBe('local')
  })
})
