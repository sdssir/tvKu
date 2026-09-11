<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { APP } from '@/config/app'
import { usePlayer } from '@/composables/usePlayer'

/**
 * The screensaver: a scrim over everything with a hole over a running
 * preview, and a clock that drifts to a new spot every so often. Nothing on
 * it is bright, and nothing on it stays put.
 */
const player = usePlayer()

const clock = ref('')
const pos = ref({ x: 12, y: 18 })
let tick: ReturnType<typeof setInterval> | null = null
let drift: ReturnType<typeof setInterval> | null = null

function updateClock() {
  clock.value = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
function move() {
  // Keep the block within the safe area; the values are vw/vh percentages.
  pos.value = { x: 8 + Math.random() * 60, y: 10 + Math.random() * 60 }
}
onMounted(() => {
  updateClock()
  move()
  tick = setInterval(updateClock, 15_000)
  drift = setInterval(move, 20_000)
})
onBeforeUnmount(() => {
  if (tick) clearInterval(tick)
  if (drift) clearInterval(drift)
})

/** The hole: the preview's rectangle while a preview is running, else nothing. */
const hole = computed(() => (player.isPreviewing.value ? player.previewRect.value : null))
const holeStyle = computed(() => {
  const h = hole.value
  if (!h) return { left: '50%', top: '50%', width: '0px', height: '0px' }
  return { left: `${h.left}px`, top: `${h.top}px`, width: `${h.width}px`, height: `${h.height}px`, borderRadius: `${h.radius ?? 0}px` }
})

const nowPlaying = computed(() => {
  const s = player.session.value
  if (!s) return ''
  if (s.kind === 'live') return s.channel.name
  if (s.kind === 'vod') return s.item.name
  return `${s.series.name} · S${s.episode.seasonNumber}E${s.episode.episodeNumber}`
})
</script>

<template>
  <div class="saver" aria-hidden="true">
    <!-- A box with an enormous shadow: the shadow is the scrim, the box is the hole. -->
    <div class="saver__hole" :style="holeStyle"></div>
    <div class="saver__block" :style="{ left: `${pos.x}vw`, top: `${pos.y}vh` }">
      <span class="saver__clock">{{ clock }}</span>
      <span v-if="nowPlaying" class="saver__now">{{ nowPlaying }}</span>
      <span class="saver__brand">{{ APP.title }}</span>
    </div>
  </div>
</template>

<style scoped>
.saver {
  position: fixed;
  inset: 0;
  z-index: 70;
  overflow: hidden;
  animation: saver-in 1.2s ease both;
}
@keyframes saver-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
.saver__hole {
  position: absolute;
  box-shadow: 0 0 0 200vmax rgba(0, 0, 0, 0.9);
  pointer-events: none;
}
.saver__block {
  position: absolute;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  transition:
    left 6s ease-in-out,
    top 6s ease-in-out;
}
.saver__clock {
  font-family: var(--font-display);
  font-size: 6rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.03em;
  color: rgba(255, 255, 255, 0.45);
  font-variant-numeric: tabular-nums;
}
.saver__now {
  font-size: var(--fs-lg);
  color: rgba(255, 255, 255, 0.35);
}
.saver__brand {
  font-family: var(--font-display);
  font-size: var(--fs-md);
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(242, 181, 68, 0.3);
}
</style>
