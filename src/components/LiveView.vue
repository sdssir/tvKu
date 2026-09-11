<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { LIVE_ROW_REM } from '@/config/app'
import { useCatalog } from '@/composables/useCatalog'
import { usePlayer } from '@/composables/usePlayer'
import { fmtTime, progressOf, useEpg } from '@/composables/useEpg'
import type { LiveChannel } from '@/types/iptv'
import { qualityLabel } from '@/services/quality'
import VirtualList from './VirtualList.vue'
import CategoryRow from './CategoryRow.vue'
import ChannelRow from './ChannelRow.vue'
import ViewToolbar from './ViewToolbar.vue'
import Icon from './Icon.vue'

/**
 * Live TV: toolbar · categories | channels | preview.
 *
 * OK on a channel starts it in the preview panel; OK again (or OK on the
 * preview itself) goes full screen. The preview is the one video element
 * showing through a transparent hole — see usePlayer — so this panel must
 * never paint a background over that box.
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
  return m
})

function onBrowseCategory(i: number) {
  const cat = categories.value[i]
  if (!cat) return
  activeCategoryId.value = cat.id
  chCursor.value = 0
}
watch(
  () => catalog.queries.value.live,
  () => (chCursor.value = 0),
)

watch(cursorChannel, (ch) => epg.request(ch), { immediate: true })

const nowEntry = computed(() => epg.entries.value.find((e) => progressOf(e) !== null) ?? null)
const nextEntries = computed(() => epg.entries.value.filter((e) => e.start > Date.now()).slice(0, 3))
const nowProgress = computed(() => (nowEntry.value ? (progressOf(nowEntry.value) ?? 0) * 100 : 0))

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
  player.setPreviewRect({ left: r.left, top: r.top, width: r.width, height: r.height, radius: 0.875 * rem })
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
  // Leaving the tab ends the preview; full-screen playback carries on.
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

const playingId = computed(() => previewChannel.value?.id ?? null)
const badge = (id: string) => {
  const q = catalog.qualityFor(id)
  return q ? qualityLabel(q.w, q.h) : null
}
const resText = computed(() => {
  const r = player.resolution.value
  return r ? `${qualityLabel(r.w, r.h)} · ${r.w}×${r.h}` : null
})
/** The panel describes the previewing channel when there is one, else the cursor. */
const shown = computed(() => (previewing.value ? previewChannel.value : cursorChannel.value))
</script>

<template>
  <div class="view">
    <ViewToolbar
      kind="live"
      title="Live TV"
      :count="channels.length"
      :query="catalog.queries.value.live"
      :sort="catalog.sortModes.value.live"
      placeholder="Search channels"
      @update:query="(q) => (catalog.queries.value.live = q)"
      @update:sort="(s) => (catalog.sortModes.value.live = s)"
    />

    <div class="live view__body">
      <aside class="live__cats panel" :class="{ 'is-dim': searching }">
        <VirtualList
          v-model:cursor="catCursor"
          :items="categories"
          focus-id="live-cats"
          :item-height-rem="3.5"
          @browse="onBrowseCategory"
          @select="onBrowseCategory"
        >
          <template #default="{ item, isCursor, isMarked }">
            <CategoryRow :category="item" :is-cursor="isCursor" :is-marked="isMarked" :active="!searching && item.id === activeCategoryId" :count="counts.get(item.id)" />
          </template>
        </VirtualList>
      </aside>

      <section class="live__list panel">
        <VirtualList v-model:cursor="chCursor" :items="channels" focus-id="live-list" :item-height-rem="LIVE_ROW_REM" @select="onChannel">
          <template #default="{ item, isCursor, isMarked }">
            <ChannelRow :channel="item" :is-cursor="isCursor" :is-marked="isMarked" :favorite="catalog.isFavorite(item.id)" :playing="item.id === playingId" :quality="badge(item.id)" />
          </template>
          <template #empty>{{ searching ? 'No channels match' : 'No channels in this category' }}</template>
        </VirtualList>
      </section>

      <aside class="live__side">
        <!-- Transparent while previewing: the video stage shows through here. -->
        <button ref="previewBox" class="preview" :class="{ 'is-live': previewing }" data-focus-id="live-preview" @click="watchFull">
          <template v-if="previewing && previewChannel">
            <span class="preview__chip badge badge--live">LIVE</span>
            <span v-if="resText" class="preview__res">{{ resText }}</span>
            <span class="preview__expand"><Icon name="expand" /> Full screen</span>
          </template>
          <template v-else>
            <span class="preview__logo">
              <img v-if="cursorChannel?.logo" :src="cursorChannel.logo" alt="" />
            </span>
            <span class="preview__hint"><Icon name="play" /> Press OK on a channel to preview</span>
          </template>
        </button>

        <div class="info panel">
          <template v-if="shown">
            <p class="eyebrow">Channel {{ shown.num }}<template v-if="previewing"> · Now previewing</template></p>
            <h2 class="info__name">{{ shown.name }}</h2>

            <div v-if="nowEntry" class="info__now">
              <p class="tiny">{{ fmtTime(nowEntry.start) }} – {{ fmtTime(nowEntry.end) }}</p>
              <p class="info__title">{{ nowEntry.title }}</p>
              <div class="bar"><span :style="{ width: `${nowProgress}%` }"></span></div>
              <p class="info__desc muted">{{ nowEntry.description }}</p>
            </div>
            <p v-else-if="epg.loading.value" class="tiny">Loading guide…</p>
            <p v-else class="tiny">No programme guide for this channel</p>

            <ul v-if="nextEntries.length" class="info__next">
              <li v-for="e in nextEntries" :key="e.start">
                <span class="tiny">{{ fmtTime(e.start) }}</span>
                <span>{{ e.title }}</span>
              </li>
            </ul>

            <div class="info__actions">
              <button class="btn btn--primary" data-focus-id="live-watch" @click="watchFull"><Icon name="expand" /> Watch full screen</button>
              <button class="btn" data-focus-id="live-fav" @click="catalog.toggleFavorite(shown)">
                <Icon :name="catalog.isFavorite(shown.id) ? 'heart-filled' : 'heart'" />
              </button>
            </div>
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
  grid-template-columns: 18rem 1fr 34rem;
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

/* The hole. No background here or on any ancestor while previewing. */
.preview {
  position: relative;
  flex: none;
  aspect-ratio: 16 / 9;
  width: 100%;
  border-radius: var(--r-md);
  border: 3px solid var(--line);
  background: var(--bg-1);
  display: grid;
  place-items: center;
  overflow: hidden;
  transition:
    border-color var(--t-fast),
    box-shadow var(--t-fast);
}
.preview.is-live {
  background: transparent;
}
.preview:focus {
  border-color: var(--focus-ring);
  box-shadow: 0 0 0 0.22rem var(--focus-glow);
}
.preview__logo {
  display: grid;
  place-items: center;
  width: 60%;
  height: 50%;
}
.preview__logo img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  opacity: 0.9;
}
.preview__hint {
  position: absolute;
  bottom: var(--sp-3);
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--fs-sm);
  color: var(--text-muted);
}
.preview__chip {
  position: absolute;
  top: var(--sp-3);
  left: var(--sp-3);
}
.preview__res {
  position: absolute;
  top: var(--sp-3);
  right: var(--sp-3);
  padding: 0.1rem 0.55rem;
  border-radius: var(--r-sm);
  background: rgba(0, 0, 0, 0.6);
  font-size: var(--fs-xs);
  font-weight: 700;
  color: var(--accent);
}
.preview__expand {
  position: absolute;
  bottom: var(--sp-3);
  right: var(--sp-3);
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  padding: 0.2rem 0.7rem;
  border-radius: var(--r-pill);
  background: rgba(0, 0, 0, 0.6);
  font-size: var(--fs-xs);
  font-weight: 700;
  opacity: 0;
  transition: opacity var(--t-fast);
}
.preview:focus .preview__expand {
  opacity: 1;
}

.info {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-5);
  overflow: hidden;
}
.info__name {
  font-size: var(--fs-xl);
  font-weight: 700;
  line-height: 1.15;
}
.info__now {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding-top: var(--sp-3);
  border-top: 1px solid var(--line);
}
.info__title {
  font-weight: 700;
  font-size: var(--fs-lg);
}
.info__desc {
  font-size: var(--fs-sm);
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.info__next {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  font-size: var(--fs-sm);
}
.info__next li {
  display: grid;
  grid-template-columns: 4.5rem 1fr;
  gap: var(--sp-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.info__actions {
  margin-top: auto;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--sp-3);
}
</style>
