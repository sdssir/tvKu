<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { focusedId, type Direction } from '@/composables/useTvNavigation'
import type { CatalogItem } from '@/types/iptv'
import { useCatalog } from '@/composables/useCatalog'
import MediaCard from './MediaCard.vue'

/**
 * Poster grid, one focusable with an x/y cursor, rendering only the rows in
 * view. Declines a move at the grid edge so the D-pad can leave.
 */
const props = defineProps<{
  items: readonly CatalogItem[]
  focusId: string
  columns: number
  cursor: number
  /** Card aspect: posters for movies/series, wide tiles for live channels. */
  variant?: 'poster' | 'wide'
}>()
const emit = defineEmits<{ 'update:cursor': [index: number]; select: [item: CatalogItem] }>()

const catalog = useCatalog()
const root = ref<HTMLElement | null>(null)
const rowHeightRem = computed(() => (props.variant === 'wide' ? 11.5 : 22.5))
const viewportRows = ref(3)

function measure() {
  const el = root.value
  if (!el) return
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  viewportRows.value = Math.max(1, Math.floor(el.clientHeight / (rowHeightRem.value * rem)))
}
let ro: ResizeObserver | null = null
onMounted(() => {
  measure()
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(measure)
    if (root.value) ro.observe(root.value)
  }
  root.value?.addEventListener('focus-axis', onAxis as EventListener)
})
onBeforeUnmount(() => {
  ro?.disconnect()
  root.value?.removeEventListener('focus-axis', onAxis as EventListener)
})

const count = computed(() => props.items.length)
const focused = computed(() => focusedId.value === props.focusId)
const rows = computed(() => Math.ceil(count.value / props.columns))
const safeCursor = computed(() => Math.min(Math.max(0, props.cursor), Math.max(0, count.value - 1)))
const cursorRow = computed(() => Math.floor(safeCursor.value / props.columns))

const firstRow = computed(() => {
  const max = Math.max(0, rows.value - viewportRows.value)
  return Math.min(max, Math.max(0, cursorRow.value - Math.floor((viewportRows.value - 1) / 2)))
})
const window_ = computed(() => {
  const out: Array<{ item: CatalogItem; index: number; row: number; col: number }> = []
  const start = firstRow.value * props.columns
  const end = Math.min(count.value, (firstRow.value + viewportRows.value + 1) * props.columns)
  for (let i = start; i < end; i++) {
    out.push({
      item: props.items[i]!,
      index: i,
      row: Math.floor(i / props.columns) - firstRow.value,
      col: i % props.columns,
    })
  }
  return out
})

function setCursor(i: number) {
  const next = Math.min(Math.max(0, i), Math.max(0, count.value - 1))
  if (next !== props.cursor) emit('update:cursor', next)
}

function onAxis(e: CustomEvent<Direction>) {
  const c = safeCursor.value
  const cols = props.columns
  let next: number
  switch (e.detail) {
    case 'left':
      if (c % cols === 0) return
      next = c - 1
      break
    case 'right':
      if (c % cols === cols - 1 || c + 1 >= count.value) return
      next = c + 1
      break
    case 'up':
      if (c < cols) return
      next = c - cols
      break
    case 'down':
      if (c + cols >= count.value) {
        // Last partial row: jump to the final item rather than refusing.
        if (Math.floor(c / cols) === rows.value - 1) return
        next = count.value - 1
        break
      }
      next = c + cols
      break
  }
  e.preventDefault()
  setCursor(next)
}

function onWheel(e: WheelEvent) {
  if (!count.value) return
  e.preventDefault()
  setCursor(safeCursor.value + (e.deltaY > 0 ? props.columns : -props.columns))
}

function onCardClick(i: number) {
  setCursor(i)
  emit('select', props.items[i]!)
}
function onClick(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('[data-card]')) return
  if (count.value) emit('select', props.items[safeCursor.value]!)
}

watch(count, () => {
  if (props.cursor > count.value - 1) emit('update:cursor', Math.max(0, count.value - 1))
})
</script>

<template>
  <div
    ref="root"
    class="grid"
    :data-focus-id="focusId"
    data-focus-axis="xy"
    tabindex="-1"
    role="grid"
    :style="{ '--cols': columns, '--row-h': `${rowHeightRem}rem` }"
    @wheel="onWheel"
    @click="onClick"
  >
    <div v-if="!count" class="empty"><slot name="empty">Nothing here</slot></div>
    <div
      v-for="cell in window_"
      :key="cell.item.id"
      class="grid__cell"
      data-card
      :style="{ top: `calc(${cell.row} * var(--row-h))`, left: `calc(${cell.col} * (100% / var(--cols)))` }"
      @click.stop="onCardClick(cell.index)"
    >
      <MediaCard
        :item="cell.item"
        :variant="variant ?? 'poster'"
        :is-cursor="cell.index === safeCursor && focused"
        :is-marked="cell.index === safeCursor && !focused"
        :favorite="catalog.isFavorite(cell.item.id)"
      />
    </div>
  </div>
</template>

<style scoped>
.grid {
  position: relative;
  height: 100%;
  overflow: hidden;
}
.grid__cell {
  position: absolute;
  width: calc(100% / var(--cols));
  height: var(--row-h);
  padding: var(--sp-3) var(--sp-3);
}
</style>
