<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAccount } from '@/composables/useAccount'
import { useCatalog } from '@/composables/useCatalog'
import { usePlayer } from '@/composables/usePlayer'
import { useTvNavigation } from '@/composables/useTvNavigation'
import type { VodDetails, VodItem } from '@/types/iptv'
import Icon from './Icon.vue'
import { fmtBytes, fmtMbps, parseDuration, probeSize } from '@/services/mediaInfo'

const props = defineProps<{ item: VodItem }>()
const emit = defineEmits<{ close: [] }>()

const acct = useAccount()
const catalog = useCatalog()
const player = usePlayer()
const nav = useTvNavigation()

const details = ref<VodDetails | null>(null)
const loading = ref(true)
const bytes = ref<number | null>(null)
onMounted(() => {
  const url = acct.vodUrl(props.item)
  if (url) void probeSize(url).then((n) => (bytes.value = n))
})
/** "1.6 GB · 2.1 Mbps" — the honest quality figure; resolution alone flatters upscales. */
const sizeText = computed(() => {
  const b = bytes.value
  if (!b) return null
  const secs = parseDuration(details.value?.duration)
  return secs ? `${fmtBytes(b)} · ${fmtMbps(b, secs)}` : fmtBytes(b)
})

onMounted(async () => {
  nav.pushOverlay('vod-detail', () => emit('close'))
  void nav.reanchorFocus('detail-play')
  if (acct.api.value && !props.item.url) {
    try {
      details.value = await acct.api.value.vodInfo(props.item.streamId)
    } catch {
      /* the list already has enough to play */
    }
  }
  loading.value = false
})

const position = computed(() => catalog.positionFor(props.item.id))
const resumeLabel = computed(() => {
  const p = position.value
  if (!p) return null
  const m = Math.floor(p.at / 60)
  return `Resume from ${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
})

function play(fromStart = false) {
  if (fromStart) catalog.savePosition(props.item.id, 0, 1)
  void player.playVod(props.item)
}

const backdrop = computed(() => details.value?.backdrop ?? props.item.poster)
/** Only a poster to show: it is portrait, so size it by height instead of covering. */
const posterOnly = computed(() => !details.value?.backdrop && !!props.item.poster)
</script>

<template>
  <div class="detail" :class="{ 'is-poster-backdrop': posterOnly }" :style="backdrop ? { '--backdrop': `url(${JSON.stringify(backdrop)})` } : undefined">
    <div class="detail__scrim"></div>
    <div class="detail__body">
      <div class="detail__poster">
        <img v-if="item.poster" :src="item.poster" alt="" />
      </div>
      <div class="detail__text">
        <h1>{{ item.name }}</h1>
        <p class="detail__meta muted">
          <span v-if="item.year">{{ item.year }}</span>
          <span v-if="details?.duration">{{ details.duration }}</span>
          <span v-if="item.rating">★ {{ item.rating.toFixed(1) }}</span>
          <span v-if="details?.genre">{{ details.genre }}</span>
          <span v-if="sizeText" class="detail__size">{{ sizeText }}</span>
        </p>
        <p v-if="details?.plot" class="detail__plot">{{ details.plot }}</p>
        <p v-else-if="loading" class="tiny">Loading details…</p>
        <p v-if="details?.cast" class="tiny">Cast: {{ details.cast }}</p>
        <p v-if="details?.director" class="tiny">Director: {{ details.director }}</p>

        <div class="detail__actions">
          <button class="btn btn--primary" data-focus-id="detail-play" @click="play()">
            <Icon name="play" /> {{ resumeLabel ?? 'Play' }}
          </button>
          <button v-if="resumeLabel" class="btn" data-focus-id="detail-restart" @click="play(true)">Play from start</button>
          <button class="btn" data-focus-id="detail-fav" @click="catalog.toggleFavorite(item)">
            <Icon :name="catalog.isFavorite(item.id) ? 'heart-filled' : 'heart'" /> {{ catalog.isFavorite(item.id) ? 'Favourite' : 'Add favourite' }}
          </button>
          <button class="btn btn--ghost" data-focus-id="detail-back" @click="emit('close')"><Icon name="back" /> Back</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="./detail.css"></style>
