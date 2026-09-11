<script setup lang="ts">
import { computed, ref } from 'vue'
import { POSTER_COLUMNS } from '@/config/app'
import { useCatalog } from '@/composables/useCatalog'
import type { CatalogItem } from '@/types/iptv'
import PosterGrid from './PosterGrid.vue'

const emit = defineEmits<{ open: [item: CatalogItem] }>()
const catalog = useCatalog()
const section = ref<'favorites' | 'recent'>('favorites')
const cursor = ref(0)
const items = computed(() => (section.value === 'favorites' ? catalog.favorites.value : catalog.recents.value))
</script>

<template>
  <div class="favs">
    <div class="favs__bar">
      <button class="btn" :class="{ 'btn--primary': section === 'favorites' }" data-focus-id="favs-tab-fav" @click="section = 'favorites'; cursor = 0">
        ♥ Favourites
      </button>
      <button class="btn" :class="{ 'btn--primary': section === 'recent' }" data-focus-id="favs-tab-recent" @click="section = 'recent'; cursor = 0">
        Recently watched
      </button>
    </div>
    <div class="favs__grid">
      <PosterGrid v-model:cursor="cursor" :items="items" focus-id="favs-grid" :columns="POSTER_COLUMNS" variant="wide" @select="(i) => emit('open', i)">
        <template #empty>
          {{ section === 'favorites' ? 'Add favourites with the ♡ button on any channel or title' : 'Nothing watched yet' }}
        </template>
      </PosterGrid>
    </div>
  </div>
</template>

<style scoped>
.favs {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  height: 100%;
}
.favs__bar {
  display: flex;
  gap: var(--sp-3);
}
.favs__grid {
  flex: 1;
  min-height: 0;
}
</style>
