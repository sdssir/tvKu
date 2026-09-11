<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { POSTER_COLUMNS } from '@/config/app'
import { useCatalog } from '@/composables/useCatalog'
import type { CatalogItem, ContentKind } from '@/types/iptv'
import VirtualList from './VirtualList.vue'
import CategoryRow from './CategoryRow.vue'
import PosterGrid from './PosterGrid.vue'
import ViewToolbar from './ViewToolbar.vue'

/** Movies and Series share this: toolbar, category rail and a poster grid. */
const props = defineProps<{ kind: Exclude<ContentKind, 'live'> }>()
const emit = defineEmits<{ open: [item: CatalogItem] }>()

const catalog = useCatalog()
const categories = computed(() => catalog.categoriesFor(props.kind))
const catCursor = ref(0)
const gridCursor = ref(0)
const activeCategoryId = ref(categories.value[0]?.id ?? '')
const items = computed(() => catalog.itemsIn(props.kind, activeCategoryId.value))
const searching = computed(() => catalog.isSearching(props.kind))
const title = computed(() => (props.kind === 'vod' ? 'Movies' : 'Series'))

const counts = computed(() => {
  const m = new Map<string, number>()
  for (const c of catalog.listFor(props.kind)) m.set(c.categoryId, (m.get(c.categoryId) ?? 0) + 1)
  return m
})

const loading = computed(() => catalog.loading.value[props.kind])
onMounted(() => void catalog.ensure(props.kind))
watch(
  () => props.kind,
  (k) => void catalog.ensure(k),
)
watch(
  () => [catalog.queries.value[props.kind], catalog.sortModes.value[props.kind]],
  () => (gridCursor.value = 0),
)

function onBrowseCategory(i: number) {
  const cat = categories.value[i]
  if (!cat) return
  activeCategoryId.value = cat.id
  gridCursor.value = 0
}
</script>

<template>
  <div v-if="loading" class="loading-block">
    <span class="spinner"></span>
    <p>Loading {{ title.toLowerCase() }}… this takes a moment the first time</p>
  </div>
  <div v-else class="view">
    <ViewToolbar
      :kind="kind"
      :title="title"
      :count="items.length"
      :noun="kind === 'vod' ? 'Movies' : 'Series'"
      :subtitle="`${catalog.categories.value[kind].length} categories`"
      :query="catalog.queries.value[kind]"
      :sort="catalog.sortModes.value[kind]"
      :placeholder="`Search ${title.toLowerCase()}`"
      @update:query="(q) => (catalog.queries.value[kind] = q)"
      @update:sort="(s) => (catalog.sortModes.value[kind] = s)"
    />
    <div class="media view__body">
      <aside class="media__cats panel" :class="{ 'is-dim': searching }">
        <VirtualList
          v-model:cursor="catCursor"
          :items="categories"
          :focus-id="`${kind}-cats`"
          :item-height-rem="3.5"
          @browse="onBrowseCategory"
          @select="onBrowseCategory"
        >
          <template #default="{ item, isCursor, isMarked }">
            <CategoryRow :category="item" :is-cursor="isCursor" :is-marked="isMarked" :active="!searching && item.id === activeCategoryId" :count="counts.get(item.id)" />
          </template>
        </VirtualList>
      </aside>
      <section class="media__grid">
        <PosterGrid v-model:cursor="gridCursor" :items="items" :focus-id="`${kind}-grid`" :columns="POSTER_COLUMNS" @select="(item) => emit('open', item)">
          <template #empty>{{ searching ? 'Nothing matches' : kind === 'vod' ? 'No movies here' : 'No series here' }}</template>
        </PosterGrid>
      </section>
    </div>
  </div>
</template>

<style scoped>
.media {
  display: grid;
  grid-template-columns: 18rem 1fr;
  gap: var(--sp-4);
  min-height: 0;
}
.media__cats {
  min-height: 0;
  padding: var(--sp-2) 0;
  overflow: hidden;
}
.media__cats.is-dim {
  opacity: 0.45;
}
.media__grid {
  min-height: 0;
}
</style>
