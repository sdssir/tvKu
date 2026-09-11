<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CatalogItem } from '@/types/iptv'

const props = defineProps<{
  item: CatalogItem
  variant: 'poster' | 'wide'
  isCursor: boolean
  favorite: boolean
}>()

const art = computed(() => (props.item.kind === 'live' ? props.item.logo : props.item.poster))
const broken = ref(false)
watch(art, () => (broken.value = false))

const meta = computed(() => {
  const i = props.item
  if (i.kind === 'live') return `CH ${i.num}`
  const bits = [i.year, i.rating ? `★ ${i.rating.toFixed(1)}` : null].filter(Boolean)
  return bits.join(' · ')
})
const initials = computed(() =>
  props.item.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join(''),
)
</script>

<template>
  <figure class="card" :class="[`card--${variant}`, { 'is-cursor': isCursor }]">
    <div class="card__art">
      <img v-if="art && !broken" :src="art" alt="" loading="lazy" @error="broken = true" />
      <span v-else class="card__initials">{{ initials }}</span>
      <span v-if="favorite" class="card__fav">♥</span>
      <span v-if="item.kind === 'live'" class="card__live">LIVE</span>
    </div>
    <figcaption class="card__caption">
      <span class="card__name">{{ item.name }}</span>
      <span class="card__meta">{{ meta }}</span>
    </figcaption>
  </figure>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  height: 100%;
  border-radius: var(--r-md);
  transition: transform var(--t-fast);
}
.card.is-cursor {
  transform: scale(1.05);
}
.card__art {
  position: relative;
  flex: 1;
  min-height: 0;
  border-radius: var(--r-md);
  background: var(--bg-2);
  border: 3px solid transparent;
  overflow: hidden;
  display: grid;
  place-items: center;
}
.card.is-cursor .card__art {
  border-color: var(--focus-ring);
  box-shadow: 0 0 0 0.2rem var(--focus-glow), var(--shadow);
}
.card__art img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.card--wide .card__art img {
  object-fit: contain;
  padding: var(--sp-3);
}
.card__initials {
  font-size: var(--fs-2xl);
  font-weight: 700;
  color: var(--text-muted);
}
.card__fav,
.card__live {
  position: absolute;
  top: var(--sp-2);
  padding: 0.1rem 0.5rem;
  border-radius: var(--r-sm);
  font-size: var(--fs-xs);
  font-weight: 700;
}
.card__fav {
  right: var(--sp-2);
  color: #fff;
  background: rgba(239, 68, 68, 0.85);
}
.card__live {
  left: var(--sp-2);
  color: #fff;
  background: var(--live);
}
.card__caption {
  display: flex;
  flex-direction: column;
  padding: var(--sp-2) var(--sp-1) 0;
  min-height: 3.2rem;
}
.card__name {
  font-size: var(--fs-sm);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.card__meta {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}
</style>
