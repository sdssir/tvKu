<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { LIVE_ROW_REM } from '@/config/app'
import { useCatalog } from '@/composables/useCatalog'
import { usePlayer } from '@/composables/usePlayer'
import { fmtTime, progressOf, useEpg } from '@/composables/useEpg'
import type { LiveChannel } from '@/types/iptv'
import { qualityLabel } from '@/services/quality'
import VirtualList from './VirtualList.vue'
import CategoryRow from './CategoryRow.vue'
import ChannelRow from './ChannelRow.vue'

/**
 * Live TV: categories | channels | now-playing panel. Browsing the category
 * rail switches the channel list immediately (Smarters-style); OK on a
 * channel opens the player with the whole list attached for zapping.
 */
const catalog = useCatalog()
const player = usePlayer()
const epg = useEpg()

const categories = computed(() => catalog.categoriesFor('live'))
// Module-level cursors so the tab remembers where it was.
const catCursor = ref(0)
const chCursor = ref(0)
const activeCategoryId = ref(categories.value[0]?.id ?? '')

const channels = computed(() => catalog.itemsIn('live', activeCategoryId.value) as LiveChannel[])
const cursorChannel = computed(() => channels.value[chCursor.value] ?? null)

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

watch(cursorChannel, (ch) => epg.request(ch), { immediate: true })

const nowEntry = computed(() => epg.entries.value.find((e) => progressOf(e) !== null) ?? null)
const nextEntries = computed(() => epg.entries.value.filter((e) => e.start > Date.now()).slice(0, 3))
const nowProgress = computed(() => (nowEntry.value ? (progressOf(nowEntry.value) ?? 0) * 100 : 0))

const badge = (id: string) => {
  const q = catalog.qualityFor(id)
  return q ? qualityLabel(q.w, q.h) : null
}
const cursorQuality = computed(() => (cursorChannel.value ? catalog.qualityFor(cursorChannel.value.id) : null))

const playingId = computed(() => (player.session.value?.kind === 'live' ? player.session.value.channel.id : null))

function play(i: number) {
  void player.playLive(channels.value, i)
}
</script>

<template>
  <div class="live">
    <aside class="live__cats panel">
      <VirtualList
        v-model:cursor="catCursor"
        :items="categories"
        focus-id="live-cats"
        :item-height-rem="3.6"
        @browse="onBrowseCategory"
        @select="onBrowseCategory"
      >
        <template #default="{ item, isCursor }">
          <CategoryRow
            :category="item"
            :is-cursor="isCursor"
            :active="item.id === activeCategoryId"
            :count="counts.get(item.id)"
          />
        </template>
      </VirtualList>
    </aside>

    <section class="live__list panel">
      <VirtualList
        v-model:cursor="chCursor"
        :items="channels"
        focus-id="live-list"
        :item-height-rem="LIVE_ROW_REM"
        @select="play"
      >
        <template #default="{ item, isCursor }">
          <ChannelRow
            :channel="item"
            :is-cursor="isCursor"
            :favorite="catalog.isFavorite(item.id)"
            :playing="item.id === playingId"
            :quality="badge(item.id)"
          />
        </template>
        <template #empty>No channels in this category</template>
      </VirtualList>
    </section>

    <aside class="live__info panel">
      <template v-if="cursorChannel">
        <div class="info__logo">
          <img v-if="cursorChannel.logo" :src="cursorChannel.logo" alt="" />
        </div>
        <h2 class="info__name">{{ cursorChannel.name }}</h2>
        <p class="tiny">
          Channel {{ cursorChannel.num }}
          <template v-if="cursorQuality"> · last played at {{ qualityLabel(cursorQuality.w, cursorQuality.h) }} ({{ cursorQuality.w }}×{{ cursorQuality.h }})</template>
        </p>

        <div v-if="nowEntry" class="info__now">
          <p class="tiny">NOW · {{ fmtTime(nowEntry.start) }} – {{ fmtTime(nowEntry.end) }}</p>
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

        <button class="btn btn--primary info__watch" data-focus-id="live-watch" @click="play(chCursor)">▶ Watch</button>
        <button class="btn" data-focus-id="live-fav" @click="catalog.toggleFavorite(cursorChannel)">
          {{ catalog.isFavorite(cursorChannel.id) ? '♥ Remove favourite' : '♡ Add favourite' }}
        </button>
      </template>
      <div v-else class="empty">Pick a channel</div>
    </aside>
  </div>
</template>

<style scoped>
.live {
  display: grid;
  grid-template-columns: 20rem 1fr 30rem;
  gap: var(--sp-4);
  height: 100%;
}
.live__cats,
.live__list,
.live__info {
  min-height: 0;
  padding: var(--sp-2) 0;
  overflow: hidden;
}
.live__info {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-5);
}
.info__logo {
  height: 8rem;
  display: grid;
  place-items: center;
  border-radius: var(--r-md);
  background: rgba(255, 255, 255, 0.04);
}
.info__logo img {
  max-height: 6.5rem;
  max-width: 70%;
  object-fit: contain;
}
.info__name {
  font-size: var(--fs-xl);
  font-weight: 700;
  line-height: 1.2;
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
  -webkit-line-clamp: 5;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.bar {
  height: 0.4rem;
  border-radius: var(--r-pill);
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
}
.bar span {
  display: block;
  height: 100%;
  background: var(--accent);
}
.info__next {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  font-size: var(--fs-sm);
}
.info__next li {
  display: grid;
  grid-template-columns: 4rem 1fr;
  gap: var(--sp-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.info__watch {
  margin-top: auto;
  justify-content: center;
}
</style>
