<script setup lang="ts">
import { ref, watch } from 'vue'
import type { LiveChannel } from '@/types/iptv'

const props = defineProps<{ channel: LiveChannel; isCursor: boolean; favorite: boolean; playing?: boolean; quality?: string | null }>()
const broken = ref(false)
watch(() => props.channel.logo, () => (broken.value = false))
</script>

<template>
  <div class="row" :class="{ 'is-cursor': isCursor, 'is-playing': playing }">
    <span class="row__num">{{ channel.num }}</span>
    <span class="row__logo">
      <img v-if="channel.logo && !broken" :src="channel.logo" alt="" loading="lazy" @error="broken = true" />
    </span>
    <span class="row__name">{{ channel.name }}</span>
    <span v-if="quality" class="row__q">{{ quality }}</span>
    <span v-if="favorite" class="row__fav">♥</span>
  </div>
</template>

<style scoped>
.row {
  display: grid;
  grid-template-columns: 3.5rem 4rem 1fr auto auto;
  align-items: center;
  gap: var(--sp-3);
  height: 100%;
  margin: 0 var(--sp-2);
  padding: 0 var(--sp-3);
  border-radius: var(--r-md);
  border: 2px solid transparent;
}
.row.is-cursor {
  background: var(--focus-bg);
  border-color: var(--focus-ring);
}
.row.is-playing .row__name {
  color: var(--accent);
}
.row__num {
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
  font-size: var(--fs-sm);
}
.row__logo {
  width: 4rem;
  height: 3rem;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.04);
  border-radius: var(--r-sm);
}
.row__logo img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.row__name {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.row__fav {
  color: #f87171;
}
.row__q {
  padding: 0.1rem 0.5rem;
  border-radius: var(--r-sm);
  border: 1px solid var(--line-strong);
  font-size: var(--fs-xs);
  font-weight: 700;
  color: var(--text-secondary);
}
</style>
