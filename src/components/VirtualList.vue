<script setup lang="ts" generic="T">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Direction } from '@/composables/useTvNavigation'

/**
 * A vertical list that is ONE focusable for the D-pad and renders only the
 * rows around its cursor. Lists here can be 20 000 channels long; the DOM
 * only ever holds a screenful. Up/Down move the cursor; at either end the
 * move is declined so focus can leave spatially.
 */
const props = defineProps<{
  items: readonly T[]
  focusId: string
  itemHeightRem: number
  cursor: number
  /** Cursor-only browsing: OK selects. When false, moving the cursor also emits `select`. */
  selectOnOk?: boolean
}>()

const emit = defineEmits<{
  'update:cursor': [index: number]
  select: [index: number]
  /** Cursor moved (by key, pointer or wheel). */
  browse: [index: number]
}>()

const root = ref<HTMLElement | null>(null)
const viewportRows = ref(8)

function measure() {
  const el = root.value
  if (!el) return
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  viewportRows.value = Math.max(1, Math.floor(el.clientHeight / (props.itemHeightRem * rem)))
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
const safeCursor = computed(() => Math.min(Math.max(0, props.cursor), Math.max(0, count.value - 1)))

/** First rendered index: keep the cursor in the middle third of the viewport. */
const first = computed(() => {
  const rows = viewportRows.value
  const max = Math.max(0, count.value - rows)
  return Math.min(max, Math.max(0, safeCursor.value - Math.floor(rows / 2)))
})
const window_ = computed(() => {
  const out: Array<{ item: T; index: number }> = []
  const end = Math.min(count.value, first.value + viewportRows.value + 1)
  for (let i = first.value; i < end; i++) out.push({ item: props.items[i]!, index: i })
  return out
})

function setCursor(i: number) {
  const next = Math.min(Math.max(0, i), Math.max(0, count.value - 1))
  if (next === props.cursor) return
  emit('update:cursor', next)
  emit('browse', next)
}

function onAxis(e: CustomEvent<Direction>) {
  const dir = e.detail
  if (dir !== 'up' && dir !== 'down') return
  const delta = dir === 'up' ? -1 : 1
  const next = safeCursor.value + delta
  if (next < 0 || next >= count.value) return // decline: focus leaves the list
  e.preventDefault()
  setCursor(next)
}

function onWheel(e: WheelEvent) {
  if (!count.value) return
  e.preventDefault()
  setCursor(safeCursor.value + (e.deltaY > 0 ? 3 : -3))
}

function onRowClick(i: number) {
  setCursor(i)
  emit('select', i)
}

// OK on the list itself (keyboard) selects the cursor row.
function onClick(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('[data-row]')) return
  if (count.value) emit('select', safeCursor.value)
}

watch(count, () => {
  if (props.cursor > count.value - 1) emit('update:cursor', Math.max(0, count.value - 1))
})

defineExpose({ setCursor })
</script>

<template>
  <div
    ref="root"
    class="vlist"
    :data-focus-id="focusId"
    data-focus-axis="y"
    tabindex="-1"
    role="listbox"
    @wheel="onWheel"
    @click="onClick"
  >
    <div v-if="!count" class="empty"><slot name="empty">Nothing here</slot></div>
    <div
      v-for="row in window_"
      :key="row.index"
      class="vlist__row"
      data-row
      :style="{ top: `${(row.index - first) * itemHeightRem}rem`, height: `${itemHeightRem}rem` }"
      :data-cursor="row.index === safeCursor ? '' : undefined"
      @click.stop="onRowClick(row.index)"
    >
      <slot :item="row.item" :index="row.index" :is-cursor="row.index === safeCursor" />
    </div>
  </div>
</template>

<style scoped>
.vlist {
  position: relative;
  height: 100%;
  overflow: hidden;
}
.vlist__row {
  position: absolute;
  left: 0;
  right: 0;
}
</style>
