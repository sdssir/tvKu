import { computed, ref } from 'vue'
import { KEYS, useStoredRef } from './useLocalStorage'
import { usePlayer } from './usePlayer'

/**
 * OLED protection. After `idleMinutes` with no remote input on a static
 * screen, a screensaver dims everything except a running preview and drifts
 * a clock about, so no bright shape sits still. Any input restores the
 * screen; the key that wakes it is swallowed so it cannot also act.
 *
 * Full-screen playback never triggers it — moving video is safe — but a
 * paused frame is a static image with a bright OSD, so that does.
 */

export const IDLE_OPTIONS = [0, 2, 3, 5, 10] as const

const idleMinutes = useStoredRef<number>(KEYS.idleMinutes, 3)
const active = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null
let installed = false

function arm() {
  if (timer) clearTimeout(timer)
  timer = null
  if (!idleMinutes.value) return
  timer = setTimeout(fire, idleMinutes.value * 60_000)
}

function fire() {
  const player = usePlayer()
  // Video on the whole screen: nothing static to protect. Check again later.
  if (player.isOpen.value && !player.video.paused) {
    arm()
    return
  }
  active.value = true
}

function wake(e?: Event) {
  const was = active.value
  active.value = false
  arm()
  if (was && e instanceof KeyboardEvent) {
    // The press that wakes the screen must not also act on what is under it.
    e.stopPropagation()
    e.preventDefault()
  }
}

function install() {
  if (installed || typeof window === 'undefined') return
  installed = true
  // Capture phase, so the wake runs before the app's own key handling.
  window.addEventListener('keydown', wake, true)
  window.addEventListener('pointerdown', wake, true)
  window.addEventListener('mousemove', wake, true)
  window.addEventListener('wheel', wake, true)
  arm()
}

export function useIdle() {
  install()
  return {
    active,
    idleMinutes,
    /** Re-arm after the setting changes. */
    setMinutes(m: number) {
      idleMinutes.value = m
      arm()
    },
    label: computed(() => (idleMinutes.value ? `${idleMinutes.value} min` : 'Off')),
  }
}
