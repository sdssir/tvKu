<script setup lang="ts">
import type { Category } from '@/types/iptv'
defineProps<{ category: Category; isCursor: boolean; isMarked?: boolean; active: boolean; count?: number }>()
</script>

<template>
  <div class="cat" :class="{ 'is-cursor': isCursor, 'is-marked': isMarked, 'is-active': active }">
    <span class="cat__name">{{ category.name }}</span>
    <span v-if="count !== undefined" class="cat__count">{{ count }}</span>
  </div>
</template>

<style scoped>
.cat {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  height: 100%;
  margin: 0 var(--sp-2);
  padding: 0 var(--sp-4);
  border-radius: var(--r-md);
  border: 2px solid transparent;
  color: var(--text-secondary);
  transition:
    background var(--t-fast),
    color var(--t-fast);
}
.cat.is-active {
  color: var(--accent);
  background: var(--accent-soft);
}
.cat.is-marked:not(.is-active) {
  background: var(--surface-hi);
}
.cat.is-cursor {
  border-color: var(--focus-ring);
  color: var(--text-primary);
  background: var(--focus-bg);
}
.cat.is-active.is-cursor {
  color: var(--accent);
}
.cat__name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 600;
}
.cat__count {
  font-size: var(--fs-xs);
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
}
</style>
