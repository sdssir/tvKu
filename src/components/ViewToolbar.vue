<script setup lang="ts">
import { SORT_OPTIONS, type SortId } from '@/config/app'
import type { ContentKind } from '@/types/iptv'
import Icon from './Icon.vue'

/** Title, live count, a search field and the sort chips — the header of every browsing tab. */
defineProps<{
  kind: ContentKind
  title: string
  count: number
  query: string
  sort: SortId
  placeholder?: string
}>()
const emit = defineEmits<{ 'update:query': [q: string]; 'update:sort': [s: SortId] }>()
</script>

<template>
  <header class="view__bar">
    <h1 class="view__title">
      {{ title }}
      <span class="view__count">{{ count.toLocaleString() }}</span>
    </h1>
    <div class="search">
      <Icon name="search" />
      <input
        :value="query"
        class="field"
        :data-focus-id="`${kind}-search`"
        type="search"
        autocomplete="off"
        autocapitalize="off"
        :placeholder="placeholder ?? 'Search'"
        @input="emit('update:query', ($event.target as HTMLInputElement).value)"
      />
    </div>
    <div class="view__tools">
      <Icon name="sort" class="tools__icon" />
      <button
        v-for="opt in SORT_OPTIONS[kind]"
        :key="opt.id"
        class="chip"
        :class="{ 'is-active': opt.id === sort }"
        :data-focus-id="`${kind}-sort-${opt.id}`"
        @click="emit('update:sort', opt.id)"
      >
        {{ opt.label }}
      </button>
    </div>
  </header>
</template>

<style scoped>
.view__bar {
  grid-template-columns: auto minmax(20rem, 30rem) auto;
}
.tools__icon {
  color: var(--text-muted);
  margin-right: var(--sp-1);
}
</style>
