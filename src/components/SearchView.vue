<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { POSTER_COLUMNS } from '@/config/app'
import { useCatalog } from '@/composables/useCatalog'
import type { CatalogItem } from '@/types/iptv'
import PosterGrid from './PosterGrid.vue'

const emit = defineEmits<{ open: [item: CatalogItem] }>()
const catalog = useCatalog()
const query = ref('')
const cursor = ref(0)
const results = computed(() => catalog.search(query.value))
// Search covers everything, so pull in whatever has not been fetched yet.
onMounted(() => {
  void catalog.ensure('vod')
  void catalog.ensure('series')
})
const pending = computed(() => catalog.loading.value.vod || catalog.loading.value.series)
</script>

<template>
  <div class="search">
    <input
      v-model="query"
      class="field search__input"
      data-focus-id="search-input"
      type="search"
      autocomplete="off"
      autocapitalize="off"
      placeholder="Search channels, movies and series…"
      @input="cursor = 0"
    />
    <p v-if="pending" class="tiny">Still loading movies and series — results will fill in.</p>
    <div class="search__grid">
      <PosterGrid v-model:cursor="cursor" :items="results" focus-id="search-grid" :columns="POSTER_COLUMNS" variant="wide" @select="(i) => emit('open', i)">
        <template #empty>{{ query.trim().length < 2 ? 'Type at least two letters' : 'No matches' }}</template>
      </PosterGrid>
    </div>
  </div>
</template>

<style scoped>
.search {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  height: 100%;
}
.search__input {
  width: 100%;
}
.search__grid {
  flex: 1;
  min-height: 0;
}
</style>
