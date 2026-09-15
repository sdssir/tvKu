<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import type { Category } from '@/types/iptv'
import CategoryIcon from './CategoryIcon.vue'
/** `divider` draws a rule above the row: used after the Favourites / Recent trio. */
const props = defineProps<{ category: Category; isCursor: boolean; isMarked?: boolean; active: boolean; count?: number; divider?: boolean }>()

/*
 * Provider names run long ("EN | NETFLIX MOVIES 2024 4K") and the column is
 * narrow. A clipped name shows an ellipsis at rest; while the cursor sits on
 * it, the text glides left and back so the whole name can be read without
 * leaving the list — the TV equivalent of a hover tooltip.
 */
const nameEl = ref<HTMLElement | null>(null)
const textEl = ref<HTMLElement | null>(null)
const overflow = ref(0)

function measure() {
  const box = nameEl.value
  const text = textEl.value
  if (!box || !text) return
  overflow.value = Math.max(0, Math.ceil(text.scrollWidth - box.clientWidth))
}

onMounted(measure)
// Virtual rows are reused for different categories, so remeasure on every name change.
watch(
  () => [props.category.name, props.isCursor],
  () => void nextTick(measure),
)
</script>

<template>
  <div class="cat" :class="{ 'is-cursor': isCursor, 'is-marked': isMarked, 'is-active': active, 'has-divider': divider }" :title="category.name">
    <CategoryIcon :id="category.id" :name="category.name" class="cat__icon" />
    <span
      ref="nameEl"
      class="cat__name"
      :class="{ 'is-scrolling': isCursor && overflow > 0 }"
      :style="{ '--shift': `-${overflow}px`, '--marquee-s': `${2.5 + overflow / 40}s` }"
    >
      <span ref="textEl" class="cat__text">{{ category.name }}</span>
    </span>
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
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: var(--fs-md);
  font-weight: 500;
}
.cat__text {
  display: inline-block;
  white-space: nowrap;
}
/* Cursor on a clipped name: drop the ellipsis and glide the text so it can all be read. */
.cat__name.is-scrolling {
  text-overflow: clip;
  /* Fade the edges so the text seems to pass under the row rather than being cut. */
  mask-image: linear-gradient(90deg, transparent, #000 0.6rem, #000 calc(100% - 0.6rem), transparent);
}
.cat__name.is-scrolling .cat__text {
  animation: cat-marquee var(--marquee-s) ease-in-out 0.6s infinite alternate;
}
@keyframes cat-marquee {
  0%,
  15% {
    transform: translateX(0);
  }
  85%,
  100% {
    transform: translateX(var(--shift));
  }
}
.cat__count {
  font-size: var(--fs-sm);
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
}
</style>
