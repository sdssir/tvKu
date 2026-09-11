<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { APP, LIVE_ROW_REM } from '@/config/app'
import { useCatalog } from '@/composables/useCatalog'
import { usePlayer } from '@/composables/usePlayer'
import { fmtTime, progressOf, useEpg } from '@/composables/useEpg'
import type { LiveChannel } from '@/types/iptv'
import { nameQualityRank, qualityLabel } from '@/services/quality'
import VirtualList from './VirtualList.vue'
import CategoryRow from './CategoryRow.vue'
import ChannelRow from './ChannelRow.vue'
import ViewToolbar from './ViewToolbar.vue'
import Icon from './Icon.vue'

/**
 * Live TV: toolbar · categories | channels | preview + programme card.
 *
 * OK on a channel starts it in the preview card; OK again (or OK on the
 * card) goes full screen. The preview is the one video element showing
 * through a transparent hole — see usePlayer — so nothing in that card may
 * paint a background while a preview is running.
 */
const catalog = useCatalog()
const player = usePlayer()
const epg = useEpg()

const categories = computed(() => catalog.categoriesFor('live'))
const catCursor = ref(0)
const chCursor = ref(0)
const activeCategoryId = ref(categories.value[0]?.id ?? '')

const channels = computed(() => catalog.itemsIn('live', activeCategoryId.value) as LiveChannel[])
const cursorChannel = computed(() => channels.value[chCursor.value] ?? null)
const searching = computed(() => catalog.isSearching('live'))

const counts = computed(() => {
  const m = new Map<string, number>()
  for (const c of catalog.live.value) m.set(c.categoryId, (m.get(c.categoryId) ?? 0) + 1)
  m.set(categories.value[0]!.id, catalog.live.value.length)
  m.set(categories.value[1]!.id, catalog.favorites.value.filter((x) => x.kind === 'live').length)
  return m
})

function onBrowseCategory(i: number) {
  const cat = categories.value[i]
  if (!cat) return
  activeCategoryId.value = cat.id
  chCursor.value = 0
}
watch(
  () => [catalog.queries.value.live, catalog.sortModes.value.live],
  () => (chCursor.value = 0),
)

watch(cursorChannel, (ch) => epg.request(ch), { immediate: true })

const nowEntry = computed(() => epg.entries.value.find((e) => progressOf(e) !== null) ?? null)
const nextEntries = computed(() => epg.entries.value.filter((e) => e.start > Date.now()).slice(0, 2))
const nowProgress = computed(() => (nowEntry.value ? (progressOf(nowEntry.value) ?? 0) * 100 : 0))
const minutesLeft = computed(() => {
  const e = nowEntry.value
  if (!e) return null
  const m = Math.max(0, Math.round((e.end - Date.now()) / 60000))
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min left` : `${m} min left`
})

/* ── preview ────────────────────────────────────────────────────────── */

const previewBox = ref<HTMLElement | null>(null)
const previewChannel = computed(() =>
  player.session.value?.kind === 'live' && player.mode.value ? player.session.value.channel : null,
)
const previewing = computed(() => player.isPreviewing.value)

function reportBox() {
  const el = previewBox.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  // Inset by the card's border so the video sits inside the rounded frame.
  const b = 3
  player.setPreviewRect({ left: r.left + b, top: r.top + b, width: r.width - 2 * b, height: r.height - 2 * b, radius: 1 * rem })
}
let ro: ResizeObserver | null = null
onMounted(async () => {
  await nextTick()
  reportBox()
  if (typeof ResizeObserver !== 'undefined' && previewBox.value) {
    ro = new ResizeObserver(reportBox)
    ro.observe(previewBox.value)
  }
  window.addEventListener('resize', reportBox)
})
onBeforeUnmount(() => {
  ro?.disconnect()
  window.removeEventListener('resize', reportBox)
  if (player.isPreviewing.value) player.close()
  player.setPreviewRect(null)
})

/** OK on a row: preview it, or go full screen if it is already the preview. */
function onChannel(i: number) {
  const ch = channels.value[i]
  if (!ch) return
  const same = previewChannel.value?.id === ch.id
  void player.playLive(channels.value, i, same && previewing.value ? 'fullscreen' : 'preview')
}
function watchFull() {
  if (previewChannel.value && previewing.value) {
    player.setMode('fullscreen')
    return
  }
  void player.playLive(channels.value, chCursor.value, 'fullscreen')
}
/** OK on the preview card: start a preview of the cursor channel, or go full screen. */
function onPreviewCard() {
  if (previewing.value) player.setMode('fullscreen')
  else void player.playLive(channels.value, chCursor.value, 'preview')
}

const playingId = computed(() => previewChannel.value?.id ?? null)
const badge = (id: string) => {
  const q = catalog.qualityFor(id)
  return q ? qualityLabel(q.w, q.h) : null
}
/** The card describes the previewing channel when there is one, else the cursor. */
const shown = computed(() => (previewing.value ? previewChannel.value : cursorChannel.value))
const shownTag = computed(() => {
  const ch = shown.value
  if (!ch) return null
  const r = player.resolution.value
  if (previewing.value && r) return qualityLabel(r.w, r.h)
  const measured = badge(ch.id)
  if (measured) return measured
  const rank = nameQualityRank(ch.name)
  return rank === 0 ? '4K' : rank <= 2 ? 'HD' : null
})
</script>

<template>
  <div class="view">
    <ViewToolbar
      kind="live"
      title="Live TV"
      :count="channels.length"
      noun="Channels"
      :subtitle="APP.liveSubtitle"
      :query="catalog.queries.value.live"
      :sort="catalog.sortModes.value.live"
      placeholder="Search channels, programmes, or categories…"
      @update:query="(q) => (catalog.queries.value.live = q)"
      @update:sort="(s) => (catalog.sortModes.value.live = s)"
    />

    <div class="live view__body">
      <aside class="live__cats panel" :class="{ 'is-dim': searching }">
        <VirtualList
          v-model:cursor="catCursor"
          :items="categories"
          focus-id="live-cats"
          :item-height-rem="3.6"
          @browse="onBrowseCategory"
          @select="onBrowseCategory"
        >
          <template #default="{ item, index, isCursor, isMarked }">
            <CategoryRow
              :category="item"
              :is-cursor="isCursor"
              :is-marked="isMarked"
              :active="!searching && item.id === activeCategoryId"
              :count="counts.get(item.id)"
              :divider="index === 3"
            />
          </template>
        </VirtualList>
      </aside>

      <section class="live__list">
        <VirtualList v-model:cursor="chCursor" :items="channels" focus-id="live-list" :item-height-rem="LIVE_ROW_REM" @select="onChannel">
          <template #default="{ item, isCursor, isMarked }">
            <ChannelRow :channel="item" :is-cursor="isCursor" :is-marked="isMarked" :favorite="catalog.isFavorite(item.id)" :playing="item.id === playingId" :quality="badge(item.id)" />
          </template>
          <template #empty>{{ searching ? 'No channels match' : 'No channels in this category' }}</template>
        </VirtualList>
      </section>

      <aside class="live__side">
        <!-- The hole. Transparent while previewing; nothing here may paint over the video. -->
        <button ref="previewBox" class="preview" :class="{ 'is-live': previewing }" data-focus-id="live-preview" @click="onPreviewCard">
          <span v-if="!previewing" class="preview__art">
            <img v-if="cursorChannel?.logo" :src="cursorChannel.logo" alt="" />
          </span>
          <span v-if="shownTag" class="badge preview__tag">{{ shownTag }}</span>
          <span v-if="previewing" class="badge badge--live preview__live">LIVE</span>
          <span class="preview__bar">
            <span class="preview__play"><Icon :name="previewing ? 'expand' : 'play'" /></span>
            <span>{{ previewing ? 'Press OK for full screen' : 'Press OK to preview this channel' }}</span>
          </span>
        </button>

        <div class="info panel">
          <template v-if="shown">
            <div class="info__head">
              <div>
                <p class="eyebrow">Channel {{ shown.num }}<template v-if="previewing"> · Previewing</template></p>
                <h2 class="info__name">{{ shown.name }}</h2>
              </div>
              <button class="info__fav" :class="{ 'is-on': catalog.isFavorite(shown.id) }" data-focus-id="live-fav" @click="catalog.toggleFavorite(shown)">
                <Icon :name="catalog.isFavorite(shown.id) ? 'heart-filled' : 'heart'" />
              </button>
            </div>

            <div v-if="nowEntry" class="info__now">
              <p class="info__time">
                <span>{{ fmtTime(nowEntry.start) }} – {{ fmtTime(nowEntry.end) }}</span>
                <span class="info__left">{{ minutesLeft }}</span>
              </p>
              <p class="info__title">{{ nowEntry.title }}</p>
              <div class="bar"><span :style="{ width: `${nowProgress}%` }"></span></div>
              <p class="info__desc">{{ nowEntry.description }}</p>
            </div>
            <p v-else-if="epg.loading.value" class="tiny">Loading guide…</p>
            <p v-else class="tiny">No programme guide for this channel</p>

            <div v-if="nextEntries.length" class="next">
              <span class="next__label">Next</span>
              <ul class="next__list">
                <li v-for="e in nextEntries" :key="e.start">
                  <span class="next__time">{{ fmtTime(e.start) }}</span>
                  <span class="next__title">{{ e.title }}</span>
                </li>
              </ul>
            </div>

            <button class="btn btn--primary info__watch" data-focus-id="live-watch" @click="watchFull"><Icon name="expand" /> Watch full screen</button>
          </template>
          <div v-else class="empty">Pick a channel</div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.live {
  display: grid;
  grid-template-columns: 19rem 1fr 32rem;
  gap: var(--sp-4);
  min-height: 0;
}
.live__cats,
.live__list {
  min-height: 0;
  padding: var(--sp-2) 0;
  overflow: hidden;
}
.live__cats.is-dim {
  opacity: 0.45;
}
.live__side {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  min-height: 0;
}

/* Preview card */
.preview {
  position: relative;
  flex: none;
  aspect-ratio: 16 / 9;
  width: 100%;
  border-radius: 1.2rem;
  border: 3px solid rgba(242, 181, 68, 0.35);
  background: var(--panel-bg);
  overflow: hidden;
  display: grid;
  place-items: center;
  transition:
    border-color var(--t-fast),
    box-shadow var(--t-fast);
}
.preview.is-live {
  background: transparent;
}
.preview:focus {
  border-color: var(--focus-ring);
  box-shadow: 0 0 0 0.2rem var(--focus-glow), 0 0 2rem var(--focus-glow);
}
.preview__art {
  display: grid;
  place-items: center;
  width: 55%;
  height: 45%;
  margin-bottom: 2.5rem;
}
.preview__art img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.preview__tag {
  position: absolute;
  top: var(--sp-3);
  right: var(--sp-3);
  color: #fff;
  border-color: rgba(255, 255, 255, 0.5);
  background: rgba(0, 0, 0, 0.55);
}
.preview__live {
  position: absolute;
  top: var(--sp-3);
  left: var(--sp-3);
}
.preview__bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4);
  background: linear-gradient(180deg, transparent, rgba(0, 0, 0, 0.8));
  font-size: var(--fs-sm);
  font-weight: 600;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}
.preview__play {
  display: grid;
  place-items: center;
  width: 2.4rem;
  height: 2.4rem;
  border-radius: 50%;
  background: var(--grad-gold);
  color: var(--accent-ink);
}
.preview__play .icon {
  width: 1.2rem;
  height: 1.2rem;
}

/* Programme card */
.info {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-5);
  overflow: hidden;
}
.info__head {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--sp-3);
  align-items: start;
}
.info__name {
  font-size: var(--fs-2xl);
  font-weight: 700;
  line-height: 1.1;
}
.info__fav {
  display: grid;
  place-items: center;
  width: 3.2rem;
  height: 3.2rem;
  border-radius: var(--r-md);
  border: 2px solid var(--card-line);
  background: var(--card);
  color: var(--text-primary);
}
.info__fav.is-on {
  color: var(--live);
}
.info__fav:focus {
  border-color: var(--focus-ring);
  box-shadow: 0 0 0 0.15rem var(--focus-glow);
}
.info__fav .icon {
  width: 1.5rem;
  height: 1.5rem;
}
.info__now {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding-top: var(--sp-3);
  border-top: 1px solid var(--line);
}
.info__time {
  display: flex;
  justify-content: space-between;
  font-size: var(--fs-sm);
  color: var(--text-secondary);
}
.info__left {
  color: var(--accent);
  font-weight: 600;
}
.info__title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: var(--fs-xl);
}
.info__desc {
  font-size: var(--fs-sm);
  line-height: 1.45;
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.next {
  display: grid;
  grid-template-columns: 3.5rem 1fr;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--r-md);
  background: var(--card);
  border: 1px solid var(--card-line);
}
.next__label {
  padding-top: 0.15rem;
  font-size: var(--fs-xs);
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--accent);
}
.next__list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  font-size: var(--fs-sm);
}
.next__list li {
  display: grid;
  grid-template-columns: 5.2rem 1fr;
  gap: var(--sp-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.next__time {
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}
.next__title {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
}
.info__watch {
  margin-top: auto;
  min-height: 3.8rem;
  font-size: var(--fs-lg);
  font-weight: 700;
}
</style>
