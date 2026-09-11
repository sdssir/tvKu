import { nextTick, onScopeDispose, ref } from 'vue'

/**
 * D-pad focus for the whole app.
 *
 * Focus is spatial, not DOM-order: every focusable carries `data-focus-id`, and
 * a move picks the nearest visible candidate in that direction from the live
 * layout. Large lists are a single focusable with `data-focus-axis` and move
 * an internal cursor themselves; only when they decline a move (at an edge)
 * does focus leave them spatially.
 */

export const KEY = {
  LEFT: 37,
  UP: 38,
  RIGHT: 39,
  DOWN: 40,
  OK: 13,
  BACK: 461,
  PLAY: 415,
  PAUSE: 19,
  PLAY_PAUSE: 10252,
  STOP: 413,
  REWIND: 412,
  FORWARD: 417,
  CH_UP: 427,
  CH_DOWN: 428,
  INFO: 457,
  RED: 403,
  GREEN: 404,
  YELLOW: 405,
  BLUE: 406,
} as const

export type Direction = 'left' | 'right' | 'up' | 'down'

const DIRECTION_OF: Record<number, Direction> = {
  [KEY.LEFT]: 'left',
  [KEY.RIGHT]: 'right',
  [KEY.UP]: 'up',
  [KEY.DOWN]: 'down',
}

const focusedId = ref<string | null>(null)

/** LIFO stack of open overlays; Back closes the top one before anything else. */
const overlays: Array<{ id: string; close: () => void }> = []

/** App-level hook for Back when nothing else consumes it. */
let backFallback: (() => boolean) | null = null

/**
 * A full-screen surface (the player) takes every key while it is open. It
 * returns true for keys it used; the rest fall through to normal handling.
 */
let interceptor: ((e: KeyboardEvent) => boolean) | null = null
export function setKeyInterceptor(fn: ((e: KeyboardEvent) => boolean) | null): void {
  interceptor = fn
}

let listening = false

/* ── geometry ─────────────────────────────────────────────────────────── */

export interface Rect {
  left: number
  right: number
  top: number
  bottom: number
  width: number
  height: number
}

interface Candidate {
  id: string
  el: HTMLElement
  rect: Rect
  clip: HTMLElement | null
}

function clipper(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflow, overflowX, overflowY } = getComputedStyle(node)
    if (/auto|scroll|hidden/.test(overflow + overflowX + overflowY)) return node
  }
  return null
}

function collect(): Candidate[] {
  const out: Candidate[] = []
  for (const el of document.querySelectorAll<HTMLElement>('[data-focus-id]')) {
    const id = el.dataset.focusId
    if (!id) continue
    if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') continue
    if (el.closest('[inert]')) continue
    if (el.offsetParent === null) continue
    const rect = el.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) continue
    out.push({ id, el, rect, clip: clipper(el) })
  }
  return out
}

const find = (id: string | null) => (id ? collect().find((c) => c.id === id) : undefined)

function sharesLane(dir: Direction, a: Rect, b: Rect): boolean {
  return dir === 'left' || dir === 'right'
    ? b.top < a.bottom && b.bottom > a.top
    : b.left < a.right && b.right > a.left
}

/**
 * Nearest candidate in `dir`. Distance along the travel axis dominates; drift
 * across it is penalised so a move never skids sideways into another column.
 * Candidates sharing the current lane always win over ones that do not.
 */
export function bestIn<T extends { id: string; rect: Rect }>(
  dir: Direction,
  from: Rect,
  candidates: T[],
  sameRegion?: (candidate: T) => boolean,
): T | null {
  const inLane = candidates.filter((c) => sharesLane(dir, from, c.rect))
  if (inLane.length) {
    if (sameRegion) {
      const local = inLane.filter(sameRegion)
      if (local.length && local.length !== inLane.length) {
        const best = pickNearest(dir, from, local)
        if (best) return best
      }
    }
    if (inLane.length !== candidates.length) {
      const best = pickNearest(dir, from, inLane)
      if (best) return best
    }
  }
  return pickNearest(dir, from, candidates)
}

function pickNearest<T extends { id: string; rect: Rect }>(dir: Direction, from: Rect, candidates: T[]): T | null {
  const fromCx = from.left + from.width / 2
  const fromCy = from.top + from.height / 2
  const EDGE = 2
  let best: T | null = null
  let bestScore = Infinity
  for (const c of candidates) {
    const cx = c.rect.left + c.rect.width / 2
    const cy = c.rect.top + c.rect.height / 2
    let along: number
    let across: number
    switch (dir) {
      case 'right':
        if (c.rect.left < from.right - EDGE) continue
        along = c.rect.left - from.right
        across = Math.abs(cy - fromCy)
        break
      case 'left':
        if (c.rect.right > from.left + EDGE) continue
        along = from.left - c.rect.right
        across = Math.abs(cy - fromCy)
        break
      case 'down':
        if (c.rect.top < from.bottom - EDGE) continue
        along = c.rect.top - from.bottom
        across = Math.abs(cx - fromCx)
        break
      case 'up':
        if (c.rect.bottom > from.top + EDGE) continue
        along = from.top - c.rect.bottom
        across = Math.abs(cx - fromCx)
        break
    }
    const score = Math.max(along, 0) + across * 2.5
    if (score < bestScore) {
      bestScore = score
      best = c
    }
  }
  return best
}

/* ── focus ────────────────────────────────────────────────────────────── */

function applyFocus(c: Candidate) {
  focusedId.value = c.id
  c.el.focus({ preventScroll: true })
  c.el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' })
}

export function focusId(id: string): boolean {
  const c = find(id)
  if (!c) return false
  applyFocus(c)
  return true
}

export function focusFirst(prefer?: RegExp): boolean {
  const all = collect()
  if (!all.length) return false
  const pick = (prefer && all.find((c) => prefer.test(c.id))) || all[0]!
  applyFocus(pick)
  return true
}

/**
 * A focusable marked `data-focus-axis="x" | "y" | "xy"` is offered the move
 * first through a cancelable `focus-axis` event. Calling preventDefault means
 * "I moved my own cursor"; otherwise the spatial engine takes over.
 */
function consumedByAxis(dir: Direction): boolean {
  const current = find(focusedId.value)
  const axis = current?.el.dataset.focusAxis
  if (!current || !axis) return false
  const horizontal = dir === 'left' || dir === 'right'
  if (horizontal && !axis.includes('x')) return false
  if (!horizontal && !axis.includes('y')) return false
  const ev = new CustomEvent<Direction>('focus-axis', { detail: dir, cancelable: true })
  current.el.dispatchEvent(ev)
  return ev.defaultPrevented
}

export function move(dir: Direction): boolean {
  if (consumedByAxis(dir)) return true
  const all = collect()
  if (!all.length) return false
  const current = focusedId.value ? all.find((c) => c.id === focusedId.value) : undefined
  if (!current) {
    applyFocus(all[0]!)
    return true
  }
  const next = bestIn(
    dir,
    current.rect,
    all.filter((c) => c.id !== current.id),
    (c) => c.clip === current.clip,
  )
  if (!next) return false
  applyFocus(next)
  return true
}

/** Re-anchor focus after the DOM changes; focus must never vanish. */
export async function reanchorFocus(fallbackId?: string | null, prefer?: RegExp): Promise<void> {
  await nextTick()
  if (focusedId.value && find(focusedId.value)) {
    focusId(focusedId.value)
    return
  }
  if (fallbackId && focusId(fallbackId)) return
  focusFirst(prefer)
}

/* ── overlays ─────────────────────────────────────────────────────────── */

export function pushOverlay(id: string, close: () => void): void {
  overlays.push({ id, close })
}
export function popOverlay(id?: string): void {
  if (!overlays.length) return
  const index = id ? overlays.findIndex((o) => o.id === id) : overlays.length - 1
  if (index >= 0) overlays.splice(index, 1)
}
export const hasOverlay = () => overlays.length > 0

/* ── key handling ─────────────────────────────────────────────────────── */

/** Ask webOS to leave the app; a no-op in a desktop browser. */
export function exitApp(): void {
  const sys = window.webOSSystem ?? window.PalmSystem
  sys?.platformBack?.()
}

export function handleBack(): boolean {
  if (overlays.length) {
    overlays[overlays.length - 1]!.close()
    overlays.pop()
    return true
  }
  if (backFallback?.()) return true
  exitApp()
  return false
}

function inTextField(): boolean {
  const el = document.activeElement
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
}

function onKeyDown(e: KeyboardEvent) {
  /*
   * A held OK/Back auto-repeats. The first press may have changed the screen
   * (sign-in, open player), so a repeat would act on whatever is now under
   * focus. Arrows keep repeating: holding Down to scroll a long list is fine.
   */
  if (e.repeat && (e.keyCode === KEY.OK || e.keyCode === KEY.BACK || e.key === 'Enter' || e.key === 'Escape')) {
    e.preventDefault()
    return
  }
  if (interceptor?.(e)) {
    e.preventDefault()
    return
  }
  const code = e.keyCode
  const dir = DIRECTION_OF[code]
  if (dir) {
    // Left/Right inside a text field move the caret; Up/Down still leave it.
    if (inTextField() && (dir === 'left' || dir === 'right')) return
    if (move(dir)) e.preventDefault()
    return
  }
  if (code === KEY.OK) {
    if (inTextField()) return // let the virtual keyboard / form handle Enter
    const c = find(focusedId.value)
    if (!c) return
    e.preventDefault()
    c.el.click()
    return
  }
  if (code === KEY.BACK || e.key === 'Escape') {
    if (inTextField()) (document.activeElement as HTMLElement).blur()
    if (handleBack()) e.preventDefault()
  }
}

/** Pointer use must keep focus in sync so the next D-pad move starts here. */
function onPointer(e: Event) {
  const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-focus-id]')
  const id = el?.dataset.focusId
  if (id && id !== focusedId.value) focusedId.value = id
}

export function useTvNavigation(options: { onBack?: () => boolean } = {}) {
  if (options.onBack) backFallback = options.onBack
  if (!listening) {
    listening = true
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointer, true)
    window.addEventListener('mouseover', onPointer, true)
    onScopeDispose(() => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointer, true)
      window.removeEventListener('mouseover', onPointer, true)
      listening = false
      backFallback = null
    })
  }
  return {
    focusedId,
    isFocused: (id: string) => focusedId.value === id,
    move,
    focusId,
    focusFirst,
    reanchorFocus,
    pushOverlay,
    popOverlay,
    hasOverlay,
    handleBack,
  }
}
