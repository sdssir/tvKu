import { computed, nextTick, ref, shallowRef } from 'vue'
import type { Episode, LiveChannel, SeriesItem, VodItem } from '@/types/iptv'
import { useAccount } from './useAccount'
import { useCatalog } from './useCatalog'
import { probeSize } from '@/services/mediaInfo'

/**
 * The application's only video engine.
 *
 * One module-scope HTMLVideoElement is reused for everything: creating an
 * element per stream leaks media pipelines on webOS and the TV eventually
 * refuses to open new ones. The player screen adopts the element into its
 * DOM while open and gives it back on close.
 *
 * Confirmed on the device: webOS does not start loading a media element that
 * is not in the document (desktop Chrome does), and moving it in the DOM
 * restarts the pipeline. So the element never moves. It lives in one fixed
 * stage under the UI for the life of the app, and "preview" versus "full
 * screen" is only a matter of the stage's rectangle: the Live TV preview
 * panel leaves a transparent hole where the stage shows through, and full
 * screen is the stage at inset 0 with the UI hidden.
 */

export type PlayerState = 'idle' | 'loading' | 'playing' | 'paused' | 'buffering' | 'error'

export type Session =
  | { kind: 'live'; channel: LiveChannel; list: LiveChannel[]; index: number }
  | { kind: 'vod'; item: VodItem }
  | { kind: 'episode'; series: SeriesItem; episode: Episode; episodes: Episode[]; index: number }

const RETRY_DELAYS = [500, 2_000, 5_000] as const
const SAVE_EVERY_MS = 5_000

const video = document.createElement('video')
video.preload = 'auto'
video.autoplay = false
video.setAttribute('playsinline', '')

const stage = document.createElement('div')
stage.id = 'video-stage'
stage.style.cssText =
  'position:fixed;left:0;top:0;width:1px;height:1px;z-index:0;overflow:hidden;background:#000;pointer-events:none;visibility:hidden;border-radius:0'
video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;background:#000;object-fit:contain'
stage.appendChild(video)
document.body.appendChild(stage)

export type PlayerMode = 'preview' | 'fullscreen'

export interface StageRect {
  left: number
  top: number
  width: number
  height: number
  radius?: number
}

/** Where the preview panel wants the video; null while nothing is previewing. */
let previewRect: StageRect | null = null

function layoutStage() {
  const m = mode.value
  if (!session.value || !m) {
    stage.style.visibility = 'hidden'
    return
  }
  stage.style.visibility = 'visible'
  if (m === 'fullscreen' || !previewRect) {
    stage.style.cssText +=
      ';left:0;top:0;width:100vw;height:100vh;border-radius:0'
    return
  }
  const r = previewRect
  stage.style.left = `${r.left}px`
  stage.style.top = `${r.top}px`
  stage.style.width = `${r.width}px`
  stage.style.height = `${r.height}px`
  stage.style.borderRadius = `${r.radius ?? 0}px`
}

/** The preview panel reports its box; null when it unmounts. */
function setPreviewRect(rect: StageRect | null): void {
  previewRect = rect
  layoutStage()
}

const state = ref<PlayerState>('idle')
const session = shallowRef<Session | null>(null)
const errorMessage = ref<string | null>(null)
const currentTime = ref(0)
const duration = ref(0)
/** null = nothing playing; 'preview' = inside the Live TV panel; 'fullscreen' = the player screen. */
const mode = ref<PlayerMode | null>(null)
/** The player screen shows only in full screen. */
const isOpen = computed(() => mode.value === 'fullscreen')
/** True while a live channel is playing inside the preview panel. */
const isPreviewing = computed(() => mode.value === 'preview')
/** Full screen entered from a preview goes back to the preview on Back. */
let cameFromPreview = false
/** Decoded frame size of the current stream, as the TV reports it. */
const resolution = ref<{ w: number; h: number } | null>(null)
/** Byte size of the current VOD file, once probed; null for live or unknown. */
const fileBytes = ref<number | null>(null)

/** Subtitles register this: called with the item key on a VOD/episode start, null on close. */
let onSessionStart: ((resumeKey: string | null) => void) | null = null
export function setSessionStartHook(fn: ((resumeKey: string | null) => void) | null): void {
  onSessionStart = fn
}

let retryTimer: ReturnType<typeof setTimeout> | null = null
let retryAttempt = 0
let lastSave = 0
let hls: import('hls.js').default | null = null

const DEBUG = import.meta.env.DEV || safeFlag('tvku:debug')
function safeFlag(k: string): boolean {
  try {
    return localStorage.getItem(k) === '1'
  } catch {
    return false
  }
}
const log = (...a: unknown[]) => {
  if (DEBUG) console.log('[player]', ...a)
}

function clearRetry() {
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
}

function destroyHls() {
  if (hls) {
    hls.destroy()
    hls = null
  }
}

async function attach(url: string): Promise<void> {
  destroyHls()
  const isHls = /\.m3u8(\?|$)/i.test(url)
  // Desktop dev only; the TV build never contains hls.js. canPlayType is not
  // consulted: desktop Chrome answers "maybe" for HLS and then fails to play it.
  if (__HLS_FALLBACK__ && isHls) {
    const { default: Hls } = await import('hls.js')
    log('hls.js supported:', Hls.isSupported())
    if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: true })
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) scheduleRetry(`hls.js: ${data.details}`)
      })
      hls.loadSource(url)
      hls.attachMedia(video)
      return
    }
  }
  video.src = url
  video.load()
}

function mediaErrorText(): string {
  const code = video.error?.code
  switch (code) {
    case MediaError.MEDIA_ERR_NETWORK:
      return 'Network error while streaming'
    case MediaError.MEDIA_ERR_DECODE:
      return 'The TV cannot decode this stream'
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return 'Stream not available or format unsupported'
    default:
      return 'Playback failed'
  }
}

function currentUrl(): string | null {
  const acct = useAccount()
  const s = session.value
  if (!s) return null
  if (s.kind === 'live') return acct.liveUrl(s.channel)
  if (s.kind === 'vod') return acct.vodUrl(s.item)
  return acct.episodeUrl(s.episode)
}

async function start(resumeAt = 0): Promise<void> {
  const url = currentUrl()
  if (!url) {
    state.value = 'error'
    errorMessage.value = 'No stream URL for this item'
    return
  }
  clearRetry()
  state.value = 'loading'
  errorMessage.value = null
  currentTime.value = 0
  duration.value = 0
  resolution.value = null
  fileBytes.value = null
  if (session.value?.kind !== 'live') {
    const forUrl = url
    void probeSize(url).then((n) => {
      if (currentUrl() === forUrl) fileBytes.value = n
    })
  }
  log('play', url)
  try {
    await attach(url)
    if (resumeAt > 0) {
      const seekOnce = () => {
        video.currentTime = resumeAt
        video.removeEventListener('loadedmetadata', seekOnce)
      }
      video.addEventListener('loadedmetadata', seekOnce)
    }
    await video.play()
  } catch (err) {
    const name = (err as Error).name
    // AbortError: a newer play() superseded this one. NotSupportedError: the
    // element's own `error` event has already scheduled the retry.
    if (name === 'AbortError' || name === 'NotSupportedError') return
    scheduleRetry((err as Error).message)
  }
}

function scheduleRetry(reason: string) {
  const delay = RETRY_DELAYS[retryAttempt]
  if (delay === undefined || !session.value) {
    state.value = 'error'
    errorMessage.value = reason
    log('giving up:', reason)
    return
  }
  retryAttempt++
  state.value = 'buffering'
  errorMessage.value = `Reconnecting… (${retryAttempt}/${RETRY_DELAYS.length})`
  log('retry in', delay, reason)
  retryTimer = setTimeout(() => void start(currentTime.value), delay)
}

/* ── media events ─────────────────────────────────────────────────────── */

video.addEventListener('playing', () => {
  retryAttempt = 0
  state.value = 'playing'
  errorMessage.value = null
})
video.addEventListener('pause', () => {
  // Only a real pause counts; load() during a retry also fires `pause`.
  if (state.value === 'playing') state.value = 'paused'
})
video.addEventListener('waiting', () => {
  if (state.value === 'playing') state.value = 'buffering'
})
/** `resize` fires when the decoder settles on a size, and again on an HLS rendition switch. */
function onResize() {
  const w = video.videoWidth
  const h = video.videoHeight
  if (!w || !h) return
  resolution.value = { w, h }
  const s = session.value
  if (s) useCatalog().saveQuality(s.kind === 'live' ? s.channel.id : s.kind === 'vod' ? s.item.id : `ep:${s.episode.id}`, w, h)
}
video.addEventListener('loadedmetadata', onResize)
video.addEventListener('resize', onResize)

video.addEventListener('durationchange', () => {
  duration.value = Number.isFinite(video.duration) ? video.duration : 0
})
video.addEventListener('timeupdate', () => {
  currentTime.value = video.currentTime
  const s = session.value
  if (!s || s.kind === 'live') return
  const now = Date.now()
  if (now - lastSave < SAVE_EVERY_MS) return
  lastSave = now
  useCatalog().savePosition(resumeKey(s), video.currentTime, video.duration)
})
video.addEventListener('ended', () => {
  const s = session.value
  if (s?.kind !== 'episode') {
    state.value = 'paused'
    return
  }
  if (s.index + 1 < s.episodes.length) void playEpisode(s.series, s.episodes, s.index + 1)
  else state.value = 'paused'
})
video.addEventListener('error', () => {
  if (!session.value) return
  scheduleRetry(mediaErrorText())
})

function resumeKey(s: Session): string {
  return s.kind === 'vod' ? s.item.id : s.kind === 'episode' ? `ep:${s.episode.id}` : s.channel.id
}

/* ── public API ───────────────────────────────────────────────────────── */

async function playLive(list: LiveChannel[], index: number, as: PlayerMode = 'fullscreen'): Promise<void> {
  const channel = list[index]
  if (!channel) return
  const s = session.value
  // Same channel already running in the preview: just switch the mode.
  if (s?.kind === 'live' && s.channel.id === channel.id && mode.value && mode.value !== as) {
    setMode(as)
    return
  }
  session.value = { kind: 'live', channel, list, index }
  onSessionStart?.(null)
  cameFromPreview = as === 'preview'
  mode.value = as
  layoutStage()
  retryAttempt = 0
  useCatalog().markWatched(channel)
  await nextTick()
  await start()
}

function setMode(as: PlayerMode) {
  if (!session.value) return
  if (as === 'fullscreen' && mode.value === 'preview') cameFromPreview = true
  mode.value = as
  layoutStage()
}

/** Back from full screen: return to the preview it came from, else stop. */
function leaveFullscreen(): void {
  if (session.value?.kind === 'live' && cameFromPreview && previewRect) setMode('preview')
  else close()
}

async function playVod(item: VodItem): Promise<void> {
  session.value = { kind: 'vod', item }
  cameFromPreview = false
  mode.value = 'fullscreen'
  layoutStage()
  retryAttempt = 0
  const cat = useCatalog()
  cat.markWatched(item)
  onSessionStart?.(item.id)
  await nextTick()
  await start(cat.positionFor(item.id)?.at ?? 0)
}

async function playEpisode(series: SeriesItem, episodes: Episode[], index: number): Promise<void> {
  const episode = episodes[index]
  if (!episode) return
  session.value = { kind: 'episode', series, episode, episodes, index }
  cameFromPreview = false
  mode.value = 'fullscreen'
  layoutStage()
  retryAttempt = 0
  const cat = useCatalog()
  cat.markWatched(series)
  onSessionStart?.(`ep:${episode.id}`)
  await nextTick()
  await start(cat.positionFor(`ep:${episode.id}`)?.at ?? 0)
}

/** Live: step through the list the channel was opened from. */
function zap(delta: number): void {
  const s = session.value
  if (s?.kind !== 'live' || !s.list.length) return
  const index = (s.index + delta + s.list.length) % s.list.length
  void playLive(s.list, index)
}

function zapTo(index: number): void {
  const s = session.value
  if (s?.kind !== 'live') return
  if (index >= 0 && index < s.list.length) void playLive(s.list, index)
}

function togglePlay(): void {
  if (!session.value) return
  if (video.paused) void video.play().catch(() => {})
  else video.pause()
}

function seekBy(seconds: number): void {
  if (!session.value || session.value.kind === 'live' || !duration.value) return
  video.currentTime = Math.min(Math.max(0, video.currentTime + seconds), duration.value - 1)
  currentTime.value = video.currentTime
}

function seekTo(seconds: number): void {
  if (!session.value || session.value.kind === 'live' || !duration.value) return
  video.currentTime = Math.min(Math.max(0, seconds), duration.value - 1)
  currentTime.value = video.currentTime
}

/** Stop and release the pipeline; the screen closes with it. */
function close(): void {
  const s = session.value
  if (s && s.kind !== 'live') useCatalog().savePosition(resumeKey(s), video.currentTime, video.duration)
  clearRetry()
  destroyHls()
  video.pause()
  video.removeAttribute('src')
  video.load()
  session.value = null
  onSessionStart?.(null)
  state.value = 'idle'
  errorMessage.value = null
  resolution.value = null
  fileBytes.value = null
  mode.value = null
  cameFromPreview = false
  layoutStage()
}

/** The TV went to the launcher / another app: stop streaming rather than run hidden. */
document.addEventListener('visibilitychange', () => {
  if (!document.hidden || !session.value) return
  if (session.value.kind === 'live') close()
  else video.pause()
})

export function usePlayer() {
  return {
    video,
    state,
    session,
    errorMessage,
    currentTime,
    duration,
    isOpen,
    isPreviewing,
    mode,
    resolution,
    fileBytes,
    setMode,
    leaveFullscreen,
    setPreviewRect,
    isLive: computed(() => session.value?.kind === 'live'),
    playLive,
    playVod,
    playEpisode,
    zap,
    zapTo,
    togglePlay,
    seekBy,
    seekTo,
    close,
    retry: () => {
      retryAttempt = 0
      void start(currentTime.value)
    },
  }
}
