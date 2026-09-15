<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { LIVE_ROW_REM } from '@/config/app'
import { useCatalog } from '@/composables/useCatalog'
import { usePlayer } from '@/composables/usePlayer'
import { fmtTime, progressOf, useEpg } from '@/composables/useEpg'
import { KEY, setKeyInterceptor } from '@/composables/useTvNavigation'
import { qualityLabel } from '@/services/quality'
import { fmtBytes, fmtMbps } from '@/services/mediaInfo'
import { useSubtitles } from '@/composables/useSubtitles'
import { useToast } from '@/composables/useToast'
import { nextCueIndex } from '@/services/srt'
import VirtualList from './VirtualList.vue'
import ChannelRow from './ChannelRow.vue'

/**
 * Full-screen playback. Owns every remote key while open:
 *
 *  Live   Up/Down, CH+/-  zap · OK  channel list · digits  go to channel number
 *  VOD    OK / ⏯  play-pause · Left/Right  ±10 s · ⏪/⏩  ±60 s · Down  subtitles
 *         Red / Green  subtitle delay −/+ 0.5 s · Yellow  subtitle sync panel
 *  Both   Info / any key  show the overlay · Back  close (or close the list)
 */
const player = usePlayer()
const catalog = useCatalog()
const epg = useEpg()
const subs = useSubtitles()
const toast = useToast()

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
const resText = computed(() => {
  const r = player.resolution.value
  if (!r) return ''
  const parts = [`${qualityLabel(r.w, r.h)} · ${r.w}×${r.h}`]
  const bytes = player.fileBytes.value
  const dur = player.duration.value
  if (bytes && dur > 0) parts.push(fmtMbps(bytes, dur), fmtBytes(bytes))
  return parts.join(' · ')
})
const badgeFor = (id: string) => {
  const q = catalog.qualityFor(id)
  return q ? qualityLabel(q.w, q.h) : null
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

/* ── subtitle picker ────────────────────────────────────────────────── */

const subOpen = ref(false)
const subCursor = ref(0)

/** Item key the chosen subtitle is remembered under. */
const subTarget = computed<{ id: string } | null>(() => {
  const s = player.session.value
  if (!s || s.kind === 'live') return null
  return { id: s.kind === 'vod' ? s.item.id : `ep:${s.episode.id}` }
})

/** Row 0 is "Off", then "Adjust timing" while a file is active, then the search hits. */
const hitBase = computed(() => (subs.active.value ? 2 : 1))
const subRows = computed(() => subs.results.value.length + hitBase.value)

async function openSubs() {
  if (!subTarget.value) return
  subOpen.value = true
  subCursor.value = 0
  if (subs.results.value.length || subs.searching.value) return
  const q = await subs.currentQuery()
  if (q) void subs.search(q)
}
function closeSubs() {
  subOpen.value = false
}
async function pickSub() {
  const target = subTarget.value
  if (!target) return
  if (subCursor.value === 0) {
    subs.turnOff(target.id)
    closeSubs()
    toast.show('Subtitles off')
    return
  }
  if (subs.active.value && subCursor.value === 1) {
    openSync()
    return
  }
  const hit = subs.results.value[subCursor.value - hitBase.value]
  if (!hit) return
  toast.show('Downloading subtitles…')
  const ok = await subs.choose(target.id, hit)
  if (ok) {
    closeSubs()
    const left = subs.remaining.value
    const who = subs.lastUser.value ? ` for ${subs.lastUser.value}` : ''
    const note = hit.provider === 'subdl' ? ' (SubDL)' : left !== null ? ` (${left} downloads left today${who})` : ''
    toast.show(`Subtitles: ${hit.language.toUpperCase()} · ${hit.release}${note}`)
  } else toast.show(subs.error.value ?? 'Could not load subtitles', 'bad')
}

const subLines = computed(() => subs.currentText.value.split('\n'))

/* ── subtitle sync ──────────────────────────────────────────────────── */

/*
 * A list of the lines around the current moment. The viewer picks the one
 * they are hearing and presses OK; the whole file shifts so that line starts
 * now. Coarse and fine nudges are there too, and the result is remembered per
 * title (useSubtitles).
 */
const syncOpen = ref(false)
const syncCursor = ref(0)
/** The cursor tracks playback until the viewer moves it. */
let syncFollow = true
const SYNC_ROWS = 11

function openSync() {
  if (!subs.active.value || !subs.cues.value.length) return
  closeSubs()
  syncFollow = true
  syncCursor.value = Math.max(0, nextCueIndex(subs.cues.value, player.currentTime.value - subs.offset.value))
  syncOpen.value = true
}
function closeSync() {
  syncOpen.value = false
}

watch(
  () => player.currentTime.value,
  (t) => {
    if (!syncOpen.value || !syncFollow) return
    const i = nextCueIndex(subs.cues.value, t - subs.offset.value)
    if (i >= 0) syncCursor.value = i
  },
)

const syncWindow = computed(() => {
  const cues = subs.cues.value
  const half = Math.floor(SYNC_ROWS / 2)
  const start = Math.min(Math.max(0, syncCursor.value - half), Math.max(0, cues.length - SYNC_ROWS))
  return cues.slice(start, start + SYNC_ROWS).map((cue, k) => ({ cue, index: start + k }))
})
/** The cue on screen right now (with the current correction), for the marker. */
const syncNowIndex = computed(() => {
  const t = player.currentTime.value - subs.offset.value
  const i = nextCueIndex(subs.cues.value, t)
  const c = subs.cues.value[i]
  return c && c.start <= t ? i : -1
})
const delayText = computed(() => {
  const o = subs.offset.value
  return `${o < 0 ? '−' : '+'}${Math.abs(o).toFixed(1)} s`
})
const delayHint = computed(() => {
  const o = subs.offset.value
  if (!o) return 'No correction'
  return `Subtitles show ${Math.abs(o).toFixed(1)} s ${o > 0 ? 'later' : 'earlier'} than the file says`
})

function syncAlign() {
  const cue = subs.cues.value[syncCursor.value]
  if (!cue) return
  subs.alignCue(cue)
  closeSync()
  toast.show(`Subtitles synced · delay ${delayText.value}`)
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

  if (syncOpen.value) {
    switch (code) {
      case KEY.UP:
        syncFollow = false
        syncCursor.value = Math.max(0, syncCursor.value - 1)
        return true
      case KEY.DOWN:
        syncFollow = false
        syncCursor.value = Math.min(subs.cues.value.length - 1, syncCursor.value + 1)
        return true
      case KEY.OK:
        syncAlign()
        return true
      case KEY.LEFT:
      case KEY.RED:
        subs.nudge(-0.5)
        return true
      case KEY.RIGHT:
      case KEY.GREEN:
        subs.nudge(0.5)
        return true
      case KEY.REWIND:
        subs.nudge(-5)
        return true
      case KEY.FORWARD:
        subs.nudge(5)
        return true
      case KEY.BLUE:
        subs.setOffset(0)
        return true
      case KEY.PLAY_PAUSE:
        player.togglePlay()
        return true
      case KEY.BACK:
        closeSync()
        return true
    }
    if (e.key === 'Escape') closeSync()
    else if (e.key === ' ') player.togglePlay()
    return true
  }

  if (subOpen.value) {
    switch (code) {
      case KEY.UP:
        subCursor.value = Math.max(0, subCursor.value - 1)
        return true
      case KEY.DOWN:
        subCursor.value = Math.min(subRows.value - 1, subCursor.value + 1)
        return true
      case KEY.OK:
        void pickSub()
        return true
      case KEY.BACK:
        closeSubs()
        return true
    }
    if (e.key === 'Escape') closeSubs()
    return true
  }

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
      player.leaveFullscreen()
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
      else void openSubs()
      return true
    case KEY.RED:
    case KEY.GREEN:
      if (!isLive && subs.active.value) {
        subs.nudge(code === KEY.RED ? -0.5 : 0.5)
        toast.show(`Subtitle delay ${delayText.value} · YELLOW to sync by ear`)
      }
      return true
    case KEY.YELLOW:
      if (!isLive && subs.active.value) openSync()
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
    player.leaveFullscreen()
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

    <div v-if="stateLabel" class="player__state" :class="{ 'is-error': player.state.value === 'error' }">
      <span v-if="player.state.value === 'loading' || player.state.value === 'buffering'" class="spinner"></span>
      <span>{{ stateLabel }}</span>
    </div>

    <div v-if="digits" class="player__digits">{{ digits }}</div>

    <div v-if="subs.currentText.value" class="subs" :class="{ 'is-raised': overlayVisible }" aria-live="off">
      <span v-for="(line, i) in subLines" :key="i" class="subs__line">{{ line }}</span>
    </div>

    <Transition name="fade">
      <div v-if="overlayVisible && !listOpen" class="overlay">
        <div v-if="live" class="overlay__live">
          <div class="overlay__logo">
            <img v-if="live.channel.logo" :src="live.channel.logo" alt="" />
          </div>
          <div class="overlay__text">
            <p class="tiny">CH {{ live.channel.num }}<span v-if="resText" class="res"> · {{ resText }}</span></p>
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
          <p v-if="resText" class="tiny res">{{ resText }}</p>
          <div class="overlay__row">
            <span class="overlay__time">{{ fmtClock(player.currentTime.value) }}</span>
            <div class="bar bar--big"><span :style="{ width: `${progressPct}%` }"></span></div>
            <span class="overlay__time">{{ fmtClock(player.duration.value) }}</span>
          </div>
          <p class="overlay__hint tiny">
            OK play/pause · ◀▶ ±10 s · ⏪⏩ ±60 s · ▼ subtitles<template v-if="subs.active.value"> ({{ subs.active.value.language.toUpperCase() }}) · YELLOW sync</template> · BACK exit
          </p>
        </div>
      </div>
    </Transition>

    <Transition name="fade">
      <aside v-if="subOpen" class="chlist panel">
        <h3>Subtitles</h3>
        <p v-if="!subs.configured.value" class="chlist__note">Add a SubDL or OpenSubtitles API key under Settings to search for subtitles.</p>
        <p v-else-if="subs.searching.value" class="chlist__note"><span class="spinner spinner--sm"></span> Searching subtitles…</p>
        <p v-else-if="subs.error.value" class="chlist__note">{{ subs.error.value }}</p>
        <div class="sublist">
          <div class="sub" :class="{ 'is-cursor': subCursor === 0, 'is-active': !subs.active.value }" @click="subCursor = 0; pickSub()">
            <span class="sub__lang">—</span>
            <span class="sub__name">Off</span>
          </div>
          <div v-if="subs.active.value" class="sub sub--timing" :class="{ 'is-cursor': subCursor === 1 }" @click="subCursor = 1; pickSub()">
            <span class="sub__lang">⏱</span>
            <span class="sub__name">Adjust timing <span v-if="subs.offset.value" class="tag tag--good">{{ delayText }}</span></span>
            <span class="tiny">Lines out of step with the speech? Sync them by ear.</span>
          </div>
          <div
            v-for="(hit, i) in subs.results.value"
            :key="hit.provider + hit.ref"
            class="sub"
            :class="{ 'is-cursor': subCursor === i + hitBase, 'is-active': subs.active.value?.release === hit.release }"
            @click="subCursor = i + hitBase; pickSub()"
          >
            <span class="sub__lang">{{ hit.language.toUpperCase() }}</span>
            <span class="sub__name">
              {{ hit.release }}
              <span v-if="hit.fromTrusted" class="tag tag--good">TRUSTED</span>
              <span v-if="hit.autoTranslated" class="tag tag--bad">AUTO-TRANSLATED</span>
              <span v-if="hit.hearingImpaired" class="tag">HI</span>
            </span>
            <span v-if="hit.provider === 'subdl'" class="tiny">
              SubDL<template v-if="hit.uploader"> · by {{ hit.uploader }}</template><template v-if="hit.matched"> · {{ hit.matched }}</template>
            </span>
            <span v-else class="tiny">
              <template v-if="hit.votes">★ {{ hit.ratings.toFixed(1) }} ({{ hit.votes }}) · </template>
              ⬇ {{ hit.downloads.toLocaleString() }} · {{ hit.matched }}
            </span>
          </div>
        </div>
      </aside>
    </Transition>

    <Transition name="fade">
      <aside v-if="syncOpen" class="chlist sync panel">
        <h3>Subtitle timing</h3>
        <div class="sync__delay">
          <span class="sync__value">{{ delayText }}</span>
          <span class="tiny">{{ delayHint }}</span>
        </div>
        <p class="chlist__note">Move to the line you are hearing right now and press OK.</p>
        <div class="synclist">
          <div
            v-for="row in syncWindow"
            :key="row.index"
            class="cue"
            :class="{ 'is-cursor': row.index === syncCursor, 'is-now': row.index === syncNowIndex }"
            @click="syncCursor = row.index; syncAlign()"
          >
            <span class="cue__time">{{ fmtClock(row.cue.start + subs.offset.value) }}</span>
            <span class="cue__text">{{ row.cue.text.replace(/\n/g, ' ') }}</span>
          </div>
        </div>
        <p class="sync__keys tiny">▲▼ line · OK hearing it now · ◀▶ ±0.5 s · ⏪⏩ ±5 s · BLUE reset · BACK done</p>
      </aside>
    </Transition>

    <Transition name="fade">
      <aside v-if="listOpen && live" class="chlist panel">
        <h3>Channels</h3>
        <VirtualList v-model:cursor="listCursor" :items="live.list" focus-id="player-chlist" :item-height-rem="LIVE_ROW_REM" @select="pickFromList">
          <template #default="{ item, isCursor }">
            <ChannelRow :channel="item" :is-cursor="isCursor" :favorite="catalog.isFavorite(item.id)" :playing="item.id === live!.channel.id" :quality="badgeFor(item.id)" />
          </template>
        </VirtualList>
      </aside>
    </Transition>
  </div>
</template>

<style scoped>
/* Transparent: the video stage sits underneath at inset 0. */
.player {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: transparent;
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
  background: var(--grad-osd);
}
.overlay h2 {
  font-size: var(--fs-2xl);
  font-weight: 800;
  line-height: 1.1;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
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
.res {
  color: var(--accent);
  font-weight: 700;
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
  background: rgba(8, 8, 10, 0.94);
  backdrop-filter: blur(12px);
}
.chlist h3 {
  padding: 0 var(--sp-5) var(--sp-3);
  font-size: var(--fs-lg);
}
.chlist__note {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: 0 var(--sp-5) var(--sp-3);
  color: var(--text-secondary);
}
.spinner--sm {
  width: 1.2rem;
  height: 1.2rem;
  border-width: 0.2rem;
}
.sublist {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.sub {
  display: grid;
  grid-template-columns: 3rem 1fr;
  grid-template-rows: auto auto;
  column-gap: var(--sp-3);
  align-items: center;
  margin: 0 var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-md);
  border: 2px solid transparent;
}
.sub.is-cursor {
  background: var(--focus-bg);
  border-color: var(--focus-ring);
}
.sub.is-active .sub__name {
  color: var(--accent);
}
.sub__lang {
  grid-row: 1 / 3;
  font-weight: 800;
  color: var(--accent-2);
}
.sub__name {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* Sync panel: stops short of the subtitle zone so the lines stay in view while tuning. */
.sync {
  bottom: 13rem;
}
.sync__delay {
  display: flex;
  align-items: baseline;
  gap: var(--sp-3);
  padding: 0 var(--sp-5) var(--sp-2);
}
.sync__value {
  font-size: var(--fs-2xl);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--accent);
}
.synclist {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.cue {
  display: grid;
  grid-template-columns: 4.5rem 1fr;
  gap: var(--sp-3);
  align-items: center;
  margin: 0 var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-md);
  border: 2px solid transparent;
  color: var(--text-secondary);
}
.cue.is-now {
  color: var(--text-primary);
}
.cue.is-now .cue__time {
  color: var(--accent);
}
.cue.is-cursor {
  background: var(--focus-bg);
  border-color: var(--focus-ring);
  color: var(--text-primary);
}
.cue__time {
  font-size: var(--fs-sm);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
}
.cue__text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: var(--fs-md);
  line-height: 1.3;
}
.sync__keys {
  padding: var(--sp-2) var(--sp-5) 0;
  color: var(--text-muted);
}
.sub--timing .sub__name {
  color: var(--text-primary);
}
.tag {
  margin-left: var(--sp-2);
  padding: 0.05rem 0.4rem;
  border-radius: var(--r-sm);
  border: 1px solid var(--line-strong);
  font-size: var(--fs-xs);
  font-weight: 700;
  color: var(--text-muted);
}
.tag--good {
  border-color: var(--accent);
  color: var(--accent);
}
.tag--bad {
  border-color: var(--warning);
  color: var(--warning);
}

/* Subtitle text: large, outlined, readable over anything. */
.subs {
  position: absolute;
  left: 10%;
  right: 10%;
  bottom: 4rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  text-align: center;
  pointer-events: none;
  transition: bottom 160ms ease;
}
.subs.is-raised {
  bottom: 11rem;
}
.subs__line {
  display: inline-block;
  padding: 0.1rem 0.6rem;
  border-radius: var(--r-sm);
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 2.3rem;
  font-weight: 600;
  line-height: 1.3;
  text-shadow:
    0 0 0.35rem #000,
    0.08rem 0.08rem 0.15rem #000;
}
</style>
