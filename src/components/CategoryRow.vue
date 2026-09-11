<script setup lang="ts">
import type { Category } from '@/types/iptv'
import CategoryIcon from './CategoryIcon.vue'
/** `divider` draws a rule above the row: used after the Favourites / Recent trio. */
defineProps<{ category: Category; isCursor: boolean; isMarked?: boolean; active: boolean; count?: number; divider?: boolean }>()
</script>

<template>
  <div class="cat" :class="{ 'is-cursor': isCursor, 'is-marked': isMarked, 'is-active': active, 'has-divider': divider }">
    <CategoryIcon :id="category.id" :name="category.name" class="cat__icon" />
    <span class="cat__name">{{ category.name }}</span>
    <span v-if="count !== undefined" class="cat__count">{{ count.toLocaleString() }}</span>
  </div>
</template>

<style scoped>
.cat {
  position: relative;
  display: grid;
  grid-template-columns: 2rem 1fr auto;
  align-items: center;
  gap: var(--sp-3);
  height: calc(100% - 0.35rem);
  margin: 0.175rem var(--sp-3);
  padding: 0 var(--sp-3);
  border-radius: var(--r-md);
  border: 2px solid transparent;
  color: var(--text-primary);
  transition:
    background var(--t-fast),
    color var(--t-fast);
}
.cat.has-divider::before {
  content: '';
  position: absolute;
  left: 0.5rem;
  right: 0.5rem;
  top: -0.3rem;
  height: 1px;
  background: var(--line-strong);
}
.cat__icon {
  color: var(--text-secondary);
}
.cat.is-active {
  color: var(--accent);
  background: var(--accent-soft);
  border-color: rgba(242, 181, 68, 0.5);
}
.cat.is-active .cat__icon {
  color: var(--accent);
}
.cat.is-marked:not(.is-active) {
  background: var(--surface-hi);
}
.cat.is-cursor {
  border-color: var(--focus-ring);
  background: var(--focus-bg);
  box-shadow: 0 0 0 0.15rem var(--focus-glow);
}
.cat__name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: var(--fs-md);
  font-weight: 500;
}
.cat__count {
  font-size: var(--fs-sm);
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
}
</style>
