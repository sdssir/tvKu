<script setup lang="ts">
import { computed, ref } from 'vue'
import { POSTER_COLUMNS } from '@/config/app'
import { useCatalog } from '@/composables/useCatalog'
import type { CatalogItem } from '@/types/iptv'
import PosterGrid from './PosterGrid.vue'
import Icon from './Icon.vue'

const emit = defineEmits<{ open: [item: CatalogItem] }>()
const catalog = useCatalog()
const section = ref<'favorites' | 'recent'>('favorites')
const cursor = ref(0)
const items = computed(() => (section.value === 'favorites' ? catalog.favorites.value : catalog.recents.value))
</script>

<template>
  <div class="view">
    <header class="view__bar favs__bar">
      <h1 class="view__title">
        {{ section === 'favorites' ? 'Favourites' : 'Recently watched' }}
        <span class="view__count">{{ items.length }}</span>
      </h1>
      <div></div>
      <div class="view__tools">
        <button class="chip" :class="{ 'is-active': section === 'favorites' }" data-focus-id="favs-tab-fav" @click="section = 'favorites'; cursor = 0">
          <Icon name="heart" /> Favourites
        </button>
        <button class="chip" :class="{ 'is-active': section === 'recent' }" data-focus-id="favs-tab-recent" @click="section = 'recent'; cursor = 0">
          <Icon name="clock" /> Recently watched
        </button>
      </div>
    </header>
    <div class="view__body">
      <PosterGrid v-model:cursor="cursor" :items="items" focus-id="favs-grid" :columns="POSTER_COLUMNS" variant="wide" @select="(i) => emit('open', i)">
        <template #empty>
          {{ section === 'favorites' ? 'Add favourites with the ♡ button on any channel or title' : 'Nothing watched yet' }}
        </template>
      </PosterGrid>
    </div>
  </div>
</template>

<style scoped>
.favs__bar {
  grid-template-columns: auto 1fr auto;
}
</style>
