<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { POSTER_COLUMNS } from '@/config/app'
import { useCatalog } from '@/composables/useCatalog'
import type { CatalogItem, ContentKind } from '@/types/iptv'
import VirtualList from './VirtualList.vue'
import CategoryRow from './CategoryRow.vue'
import PosterGrid from './PosterGrid.vue'

/** Movies and Series share this: a category rail and a poster grid. */
const props = defineProps<{ kind: Exclude<ContentKind, 'live'> }>()
const emit = defineEmits<{ open: [item: CatalogItem] }>()

const catalog = useCatalog()
const categories = computed(() => catalog.categoriesFor(props.kind))
const catCursor = ref(0)
const gridCursor = ref(0)
const activeCategoryId = ref(categories.value[0]?.id ?? '')
const items = computed(() => catalog.itemsIn(props.kind, activeCategoryId.value))

const counts = computed(() => {
  const m = new Map<string, number>()
  for (const c of catalog.listFor(props.kind)) m.set(c.categoryId, (m.get(c.categoryId) ?? 0) + 1)
  return m
})

const loading = computed(() => catalog.loading.value[props.kind])
onMounted(() => void catalog.ensure(props.kind))
watch(() => props.kind, (k) => void catalog.ensure(k))

function onBrowseCategory(i: number) {
  const cat = categories.value[i]
  if (!cat) return
  activeCategoryId.value = cat.id
  gridCursor.value = 0
}
</script>

<template>
  <div v-if="loading" class="app__loading">
    <span class="spinner"></span>
    <p>Loading {{ kind === 'vod' ? 'movies' : 'series' }}… this takes a moment the first time</p>
  </div>
  <div v-else class="media">
    <aside class="media__cats panel">
      <VirtualList
        v-model:cursor="catCursor"
        :items="categories"
        :focus-id="`${kind}-cats`"
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
    <section class="media__grid">
      <PosterGrid
        v-model:cursor="gridCursor"
        :items="items"
        :focus-id="`${kind}-grid`"
        :columns="POSTER_COLUMNS"
        @select="(item) => emit('open', item)"
      >
        <template #empty>{{ kind === 'vod' ? 'No movies here' : 'No series here' }}</template>
      </PosterGrid>
    </section>
  </div>
</template>

<style scoped>
.media {
  display: grid;
  grid-template-columns: 20rem 1fr;
  gap: var(--sp-4);
  height: 100%;
}
.media__cats {
  min-height: 0;
  padding: var(--sp-2) 0;
  overflow: hidden;
}
.media__grid {
  min-height: 0;
}
.app__loading {
  height: 100%;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: var(--sp-4);
  color: var(--text-secondary);
  font-size: var(--fs-lg);
}
</style>
