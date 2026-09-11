<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { LiveChannel } from '@/types/iptv'
import { nameQualityRank } from '@/services/quality'

const props = defineProps<{ channel: LiveChannel; isCursor: boolean; isMarked?: boolean; favorite: boolean; playing?: boolean; quality?: string | null }>()
const broken = ref(false)
watch(() => props.channel.logo, () => (broken.value = false))
/** Measured size wins; otherwise what the name claims (4K / HD), else nothing. */
const tag = computed(() => {
  if (props.quality) return props.quality
  const r = nameQualityRank(props.channel.name)
  return r === 0 ? '4K' : r <= 2 ? 'HD' : null
})
</script>

<template>
  <div class="row" :class="{ 'is-cursor': isCursor, 'is-marked': isMarked, 'is-playing': playing }">
    <span class="row__num">{{ channel.num }}</span>
    <span class="row__logo">
      <img v-if="channel.logo && !broken" :src="channel.logo" alt="" loading="lazy" @error="broken = true" />
    </span>
    <span class="row__name">{{ channel.name }}</span>
    <span v-if="playing" class="row__eq" aria-hidden="true"><i></i><i></i><i></i></span>
    <span v-if="favorite" class="row__fav">♥</span>
    <span v-if="tag" class="badge row__tag">{{ tag }}</span>
  </div>
</template>

<style scoped>
.row {
  display: grid;
  grid-template-columns: 2.4rem 4.2rem 1fr auto auto auto;
  align-items: center;
  gap: var(--sp-3);
  height: calc(100% - 0.5rem);
  margin: 0.25rem var(--sp-3);
  padding: 0 var(--sp-3) 0 var(--sp-4);
  border-radius: var(--r-md);
  background: var(--card);
  border: 2px solid var(--card-line);
  transition:
    background var(--t-fast),
    border-color var(--t-fast),
    box-shadow var(--t-fast);
}
.row.is-marked {
  background: var(--surface-hi);
  border-color: var(--line-strong);
}
.row.is-cursor {
  background: var(--focus-bg);
  border-color: var(--focus-ring);
  box-shadow: 0 0 0 0.15rem var(--focus-glow), 0 0 1.4rem var(--focus-glow);
}
.row.is-playing .row__name {
  color: var(--accent);
}
.row__num {
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
  font-size: var(--fs-md);
  font-weight: 600;
}
.row__logo {
  width: 4.2rem;
  height: 3rem;
  display: grid;
  place-items: center;
  padding: 0.25rem;
  background: #fff;
  border-radius: var(--r-sm);
}
.row__logo img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.row__name {
  font-size: var(--fs-lg);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.row__fav {
  color: var(--live);
}
.row__tag {
  color: var(--text-primary);
  border-color: var(--line-strong);
  background: rgba(0, 0, 0, 0.35);
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
