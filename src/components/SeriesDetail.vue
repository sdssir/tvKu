<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAccount } from '@/composables/useAccount'
import { useCatalog } from '@/composables/useCatalog'
import { usePlayer } from '@/composables/usePlayer'
import { useTvNavigation } from '@/composables/useTvNavigation'
import type { Episode, SeriesDetails, SeriesItem } from '@/types/iptv'
import VirtualList from './VirtualList.vue'
import Icon from './Icon.vue'

const props = defineProps<{ item: SeriesItem }>()
const emit = defineEmits<{ close: [] }>()

const acct = useAccount()
const catalog = useCatalog()
const player = usePlayer()
const nav = useTvNavigation()

const details = ref<SeriesDetails | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const seasonIdx = ref(0)
const epCursor = ref(0)

onMounted(async () => {
  nav.pushOverlay('series-detail', () => emit('close'))
  void nav.reanchorFocus('detail-fav')
  try {
    if (!acct.api.value) throw new Error('Series need an Xtream Codes account')
    details.value = await acct.api.value.seriesInfo(props.item.seriesId)
    if (!details.value.seasons.length) error.value = 'No episodes listed for this series'
    else void nav.reanchorFocus('season-0')
  } catch (err) {
    error.value = (err as Error).message
  } finally {
    loading.value = false
  }
})

const season = computed(() => details.value?.seasons[seasonIdx.value] ?? null)
const episodes = computed<Episode[]>(() => season.value?.episodes ?? [])

function selectSeason(i: number) {
  seasonIdx.value = i
  epCursor.value = 0
}
function play(i: number) {
  void player.playEpisode(props.item, episodes.value, i)
}
const watchedMark = (e: Episode) => (catalog.positionFor(`ep:${e.id}`) ? '⏵ ' : '')
const backdrop = computed(() => details.value?.backdrop ?? props.item.poster)
</script>

<template>
  <div class="detail" :style="backdrop ? { '--backdrop': `url(${JSON.stringify(backdrop)})` } : undefined">
    <div class="detail__scrim"></div>
    <div class="detail__body">
      <div class="detail__poster">
        <img v-if="item.poster" :src="item.poster" alt="" />
      </div>
      <div class="detail__text">
        <h1>{{ item.name }}</h1>
        <p class="detail__meta muted">
          <span v-if="item.year">{{ item.year }}</span>
          <span v-if="item.rating">★ {{ item.rating.toFixed(1) }}</span>
          <span v-if="details?.genre">{{ details.genre }}</span>
        </p>
        <p v-if="details?.plot ?? item.plot" class="detail__plot">{{ details?.plot ?? item.plot }}</p>

        <div class="detail__actions">
          <button class="btn" data-focus-id="detail-fav" @click="catalog.toggleFavorite(item)">
            <Icon :name="catalog.isFavorite(item.id) ? 'heart-filled' : 'heart'" /> {{ catalog.isFavorite(item.id) ? 'Favourite' : 'Add favourite' }}
          </button>
          <button class="btn btn--ghost" data-focus-id="detail-back" @click="emit('close')"><Icon name="back" /> Back</button>
        </div>

        <p v-if="loading" class="tiny">Loading episodes…</p>
        <p v-else-if="error" class="tiny">{{ error }}</p>
        <template v-else-if="details">
          <div class="detail__seasons">
            <button
              v-for="(s, i) in details.seasons"
              :key="s.number"
              class="chip"
              :class="{ 'is-active': i === seasonIdx }"
              :data-focus-id="`season-${i}`"
              @click="selectSeason(i)"
            >
              {{ s.name }}
            </button>
          </div>
          <div class="detail__episodes panel">
            <VirtualList v-model:cursor="epCursor" :items="episodes" focus-id="episodes" :item-height-rem="4" @select="play">
              <template #default="{ item: ep, isCursor }">
                <div class="ep" :class="{ 'is-cursor': isCursor }">
                  <span class="ep__num">{{ ep.episodeNumber }}</span>
                  <span class="ep__title">{{ watchedMark(ep) }}{{ ep.title }}</span>
                  <span class="tiny">{{ ep.duration ?? '' }}</span>
                </div>
              </template>
            </VirtualList>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped src="./detail.css"></style>
<style scoped>
.ep {
  display: grid;
  grid-template-columns: 3rem 1fr auto;
  align-items: center;
  gap: var(--sp-3);
  height: 100%;
  margin: 0 var(--sp-2);
  padding: 0 var(--sp-4);
  border-radius: var(--r-md);
  border: 2px solid transparent;
}
.ep.is-cursor {
  background: var(--focus-bg);
  border-color: var(--focus-ring);
}
.detail__episodes {
  background: rgba(10, 10, 13, 0.7);
  backdrop-filter: blur(10px);
}
.ep__num {
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.ep__title {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
