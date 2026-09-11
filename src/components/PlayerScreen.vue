<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { LIVE_ROW_REM } from '@/config/app'
import { useCatalog } from '@/composables/useCatalog'
import { usePlayer } from '@/composables/usePlayer'
import { fmtTime, progressOf, useEpg } from '@/composables/useEpg'
import { KEY, setKeyInterceptor } from '@/composables/useTvNavigation'
import VirtualList from './VirtualList.vue'
import ChannelRow from './ChannelRow.vue'

/**
 * Full-screen playback. Owns every remote key while open:
 *
 *  Live   Up/Down, CH+/-  zap · OK  channel list · digits  go to channel number
 *  VOD    OK / ⏯  play-pause · Left/Right  ±10 s · ⏪/⏩  ±60 s
 *  Both   Info / any key  show the overlay · Back  close (or close the list)
 */
const player = usePlayer()
const catalog = useCatalog()
const epg = useEpg()

const host = ref<HTMLElement | null>(null)
const overlayVisible = ref(false)
const listOpen = ref(false)
const listCursor = ref(0)
const digits = ref('')
let overlayTimer: ReturnType<typeof setTimeout> | null = null
let digitTimer: ReturnType<typeof setTimeout> | null = null

const OVERLAY_MS = 4000

function showOverlay(ms = OVERLAY_MS) {
  overlayVisible.value = true
  if (overlayTimer) clearTimeout(overlayTimer)
  overlayTimer = setTimeout(() => (overlayVisible.value = false), ms)
}

const live = computed(() => (player.session.value?.kind === 'live' ? player.session.value : null))
const title = computed(() => {
  const s = player.session.value
  if (!s) return ''
  if (s.kind === 'live') return s.channel.name
  if (s.kind === 'vod') return s.item.name
  return `${s.series.name} · S${s.episode.seasonNumber}E${s.episode.episodeNumber} ${s.episode.title}`
})

watch(
  () => live.value?.channel ?? null,
  (ch) => {
    epg.request(ch, 0)
    showOverlay()
  },
  { immediate: true },
)
const nowEntry = computed(() => epg.entries.value.find((e) => progressOf(e) !== null) ?? null)
const nextEntry = computed(() => epg.entries.value.find((e) => e.start > Date.now()) ?? null)

const fmtClock = (s: number) => {
  if (!Number.isFinite(s)) return '0:00'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}
const progressPct = computed(() => (player.duration.value ? (player.currentTime.value / player.duration.value) * 100 : 0))

/* ── channel list overlay ───────────────────────────────────────────── */

function openList() {
  if (!live.value) return
  listCursor.value = live.value.index
  listOpen.value = true
}
function closeList() {
  listOpen.value = false
}
function pickFromList(i: number) {
  closeList()
  player.zapTo(i)
}

/* ── digit entry ────────────────────────────────────────────────────── */

function pushDigit(d: string) {
  if (!live.value) return
  digits.value = (digits.value + d).slice(-4)
  showOverlay()
  if (digitTimer) clearTimeout(digitTimer)
  digitTimer = setTimeout(() => {
    const want = Number(digits.value)
    digits.value = ''
    const idx = live.value!.list.findIndex((c) => c.num === want)
    if (idx >= 0) player.zapTo(idx)
  }, 1500)
}

/* ── keys ───────────────────────────────────────────────────────────── */

function onKey(e: KeyboardEvent): boolean {
  const code = e.keyCode
  const isLive = !!live.value

  if (e.repeat && (code === KEY.OK || code === KEY.BACK || e.key === 'Enter' || e.key === 'Escape')) return true

  if (listOpen.value) {
    switch (code) {
      case KEY.UP:
        listCursor.value = Math.max(0, listCursor.value - 1)
        return true
      case KEY.DOWN:
        listCursor.value = Math.min(live.value!.list.length - 1, listCursor.value + 1)
        return true
      case KEY.OK:
        pickFromList(listCursor.value)
        return true
      case KEY.BACK:
        closeList()
        return true
    }
    if (e.key === 'Escape') {
      closeList()
      return true
    }
    return true // swallow everything else while the list is up
  }

  if (code >= 48 && code <= 57 && isLive) {
    pushDigit(String(code - 48))
    return true
  }

  switch (code) {
    case KEY.BACK:
      player.close()
      return true
    case KEY.OK:
      if (player.state.value === 'error') {
        player.retry()
        return true
      }
      if (isLive) openList()
      else {
        player.togglePlay()
        showOverlay()
      }
      return true
    case KEY.PLAY_PAUSE:
      player.togglePlay()
      showOverlay()
      return true
    case KEY.PLAY:
      if (player.video.paused) player.togglePlay()
      showOverlay()
      return true
    case KEY.PAUSE:
      if (!player.video.paused) player.togglePlay()
      showOverlay()
      return true
    case KEY.STOP:
      player.close()
      return true
    case KEY.UP:
    case KEY.CH_UP:
      if (isLive) player.zap(1)
      else showOverlay()
      return true
    case KEY.DOWN:
    case KEY.CH_DOWN:
      if (isLive) player.zap(-1)
      else showOverlay()
      return true
    case KEY.LEFT:
      if (!isLive) player.seekBy(-10)
      showOverlay()
      return true
    case KEY.RIGHT:
      if (!isLive) player.seekBy(10)
      showOverlay()
      return true
    case KEY.REWIND:
      if (!isLive) player.seekBy(-60)
      showOverlay()
      return true
    case KEY.FORWARD:
      if (!isLive) player.seekBy(60)
      showOverlay()
      return true
    case KEY.INFO:
      showOverlay(8000)
      return true
  }
  if (e.key === 'Escape') {
    player.close()
    return true
  }
  if (e.key === ' ') {
    player.togglePlay()
    showOverlay()
    return true
  }
  return false
}

onMounted(() => {
  host.value?.appendChild(player.video)
  setKeyInterceptor(onKey)
  showOverlay()
})
onBeforeUnmount(() => {
  setKeyInterceptor(null)
  if (overlayTimer) clearTimeout(overlayTimer)
  if (digitTimer) clearTimeout(digitTimer)
})

const stateLabel = computed(() => {
  switch (player.state.value) {
    case 'loading':
      return 'Loading…'
    case 'buffering':
      return player.errorMessage.value ?? 'Buffering…'
    case 'paused':
      return 'Paused'
    case 'error':
      return `${player.errorMessage.value ?? 'Playback failed'} — press OK to retry`
    default:
      return ''
  }
})
</script>

<template>
  <div class="player" @click="showOverlay()">
    <div ref="host" class="player__video"></div>

    <div v-if="stateLabel" class="player__state" :class="{ 'is-error': player.state.value === 'error' }">
      <span v-if="player.state.value === 'loading' || player.state.value === 'buffering'" class="spinner"></span>
      <span>{{ stateLabel }}</span>
    </div>

    <div v-if="digits" class="player__digits">{{ digits }}</div>

    <Transition name="fade">
      <div v-if="overlayVisible && !listOpen" class="overlay">
        <div v-if="live" class="overlay__live">
          <div class="overlay__logo">
            <img v-if="live.channel.logo" :src="live.channel.logo" alt="" />
          </div>
          <div class="overlay__text">
            <p class="tiny">CH {{ live.channel.num }}</p>
            <h2>{{ title }}</h2>
            <template v-if="nowEntry">
              <p class="overlay__prog">
                <b>{{ nowEntry.title }}</b>
                <span class="tiny"> {{ fmtTime(nowEntry.start) }} – {{ fmtTime(nowEntry.end) }}</span>
              </p>
              <div class="bar"><span :style="{ width: `${(progressOf(nowEntry) ?? 0) * 100}%` }"></span></div>
              <p v-if="nextEntry" class="tiny">Next: {{ nextEntry.title }} · {{ fmtTime(nextEntry.start) }}</p>
            </template>
          </div>
          <p class="overlay__hint tiny">▲▼ channel · OK list · BACK exit</p>
        </div>

        <div v-else class="overlay__vod">
          <h2>{{ title }}</h2>
          <div class="overlay__row">
            <span class="overlay__time">{{ fmtClock(player.currentTime.value) }}</span>
            <div class="bar bar--big"><span :style="{ width: `${progressPct}%` }"></span></div>
            <span class="overlay__time">{{ fmtClock(player.duration.value) }}</span>
          </div>
          <p class="overlay__hint tiny">OK play/pause · ◀▶ ±10 s · ⏪⏩ ±60 s · BACK exit</p>
        </div>
      </div>
    </Transition>

    <Transition name="fade">
      <aside v-if="listOpen && live" class="chlist panel">
        <h3>Channels</h3>
        <VirtualList v-model:cursor="listCursor" :items="live.list" focus-id="player-chlist" :item-height-rem="LIVE_ROW_REM" @select="pickFromList">
          <template #default="{ item, isCursor }">
            <ChannelRow :channel="item" :is-cursor="isCursor" :favorite="catalog.isFavorite(item.id)" :playing="item.id === live!.channel.id" />
          </template>
        </VirtualList>
      </aside>
    </Transition>
  </div>
</template>

<style scoped>
.player {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: #000;
}
.player__video,
.player__video :deep(video) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  background: #000;
}
.player__state {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-5);
  border-radius: var(--r-pill);
  background: rgba(0, 0, 0, 0.6);
  font-weight: 600;
  font-size: var(--fs-lg);
}
.player__state.is-error {
  border: 1px solid var(--danger);
}
.player__digits {
  position: absolute;
  top: var(--safe-y);
  right: var(--safe-x);
  padding: var(--sp-2) var(--sp-4);
  border-radius: var(--r-md);
  background: rgba(0, 0, 0, 0.7);
  font-size: var(--fs-3xl);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.overlay {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: var(--sp-6) var(--safe-x) var(--safe-y);
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.85));
}
.overlay h2 {
  font-size: var(--fs-2xl);
  font-weight: 800;
  line-height: 1.1;
}
.overlay__live {
  display: grid;
  grid-template-columns: 10rem 1fr auto;
  gap: var(--sp-5);
  align-items: end;
}
.overlay__logo {
  height: 6rem;
  display: grid;
  place-items: center;
  border-radius: var(--r-md);
  background: rgba(255, 255, 255, 0.08);
}
.overlay__logo img {
  max-height: 5rem;
  max-width: 80%;
  object-fit: contain;
}
.overlay__text {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
}
.overlay__prog {
  font-size: var(--fs-lg);
}
.overlay__vod {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.overlay__row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: var(--sp-4);
  align-items: center;
}
.overlay__time {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.overlay__hint {
  white-space: nowrap;
}
.bar {
  height: 0.4rem;
  max-width: 40rem;
  border-radius: var(--r-pill);
  background: rgba(255, 255, 255, 0.2);
  overflow: hidden;
}
.bar--big {
  max-width: none;
  height: 0.6rem;
}
.bar span {
  display: block;
  height: 100%;
  background: var(--accent);
}
.chlist {
  position: absolute;
  top: var(--safe-y);
  bottom: var(--safe-y);
  left: var(--safe-x);
  width: 34rem;
  display: flex;
  flex-direction: column;
  padding: var(--sp-3) 0 var(--sp-2);
  background: rgba(10, 14, 22, 0.94);
}
.chlist h3 {
  padding: 0 var(--sp-5) var(--sp-3);
  font-size: var(--fs-lg);
}
</style>
