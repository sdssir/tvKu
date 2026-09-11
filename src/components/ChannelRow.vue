<script setup lang="ts">
import { ref, watch } from 'vue'
import type { LiveChannel } from '@/types/iptv'

const props = defineProps<{ channel: LiveChannel; isCursor: boolean; isMarked?: boolean; favorite: boolean; playing?: boolean; quality?: string | null }>()
const broken = ref(false)
watch(() => props.channel.logo, () => (broken.value = false))
</script>

<template>
  <div class="row" :class="{ 'is-cursor': isCursor, 'is-marked': isMarked, 'is-playing': playing }">
    <span class="row__num">{{ channel.num }}</span>
    <span class="row__logo">
      <img v-if="channel.logo && !broken" :src="channel.logo" alt="" loading="lazy" @error="broken = true" />
    </span>
    <span class="row__name">{{ channel.name }}</span>
    <span v-if="playing" class="row__eq" aria-hidden="true"><i></i><i></i><i></i></span>
    <span v-if="quality" class="badge">{{ quality }}</span>
    <span v-if="favorite" class="row__fav">♥</span>
  </div>
</template>

<style scoped>
.row {
  display: grid;
  grid-template-columns: 3.2rem 4.2rem 1fr auto auto auto;
  align-items: center;
  gap: var(--sp-3);
  height: 100%;
  margin: 0 var(--sp-2);
  padding: 0 var(--sp-3);
  border-radius: var(--r-md);
  border: 2px solid transparent;
  transition: background var(--t-fast);
}
.row.is-marked {
  background: var(--surface-hi);
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
  text-align: right;
}
.row__logo {
  width: 4.2rem;
  height: 2.9rem;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.05);
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
  color: var(--live);
}
.row__eq {
  display: inline-flex;
  align-items: flex-end;
  gap: 0.15rem;
  height: 1rem;
}
.row__eq i {
  display: block;
  width: 0.22rem;
  background: var(--accent);
  animation: eq 0.9s ease-in-out infinite;
}
.row__eq i:nth-child(2) {
  animation-delay: 0.2s;
}
.row__eq i:nth-child(3) {
  animation-delay: 0.4s;
}
@keyframes eq {
  0%,
  100% {
    height: 0.3rem;
  }
  50% {
    height: 1rem;
  }
}
</style>
