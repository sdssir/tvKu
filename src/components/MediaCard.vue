<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CatalogItem } from '@/types/iptv'

const props = defineProps<{
  item: CatalogItem
  variant: 'poster' | 'wide'
  isCursor: boolean
  isMarked?: boolean
  favorite: boolean
}>()

const art = computed(() => (props.item.kind === 'live' ? props.item.logo : props.item.poster))
const broken = ref(false)
watch(art, () => (broken.value = false))

const meta = computed(() => {
  const i = props.item
  if (i.kind === 'live') return `CH ${i.num}`
  return [i.year, i.rating ? `★ ${i.rating.toFixed(1)}` : null].filter(Boolean).join(' · ')
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
  <figure class="card" :class="[`card--${variant}`, { 'is-cursor': isCursor, 'is-marked': isMarked }]">
    <div class="card__art">
      <img v-if="art && !broken" :src="art" alt="" loading="lazy" @error="broken = true" />
      <span v-else class="card__initials">{{ initials }}</span>
      <span v-if="item.kind === 'live'" class="badge badge--live card__live">LIVE</span>
      <span v-if="favorite" class="card__fav">♥</span>
      <figcaption class="card__caption">
        <span class="card__name">{{ item.name }}</span>
        <span class="card__meta">{{ meta }}</span>
      </figcaption>
    </div>
  </figure>
</template>

<style scoped>
.card {
  height: 100%;
  transition: transform var(--t-med);
  transform-origin: center;
}
.card.is-cursor {
  transform: scale(1.06);
  z-index: 2;
}
.card__art {
  position: relative;
  height: 100%;
  border-radius: var(--r-md);
  background: var(--bg-2);
  border: 3px solid transparent;
  overflow: hidden;
  display: grid;
  place-items: center;
  box-shadow: inset 0 0 0 1px var(--line);
  transition: box-shadow var(--t-med);
}
.card.is-marked .card__art {
  border-color: var(--line-strong);
}
.card.is-cursor .card__art {
  border-color: var(--focus-ring);
  box-shadow: var(--shadow-focus);
}
.card__art img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.card--wide .card__art img {
  object-fit: contain;
  padding: var(--sp-4) var(--sp-4) 3.4rem;
}
.card__initials {
  font-family: var(--font-display);
  font-size: var(--fs-3xl);
  font-weight: 800;
  color: var(--text-muted);
}
.card__live {
  position: absolute;
  top: var(--sp-2);
  left: var(--sp-2);
}
.card__fav {
  position: absolute;
  top: var(--sp-2);
  right: var(--sp-2);
  padding: 0.05rem 0.45rem;
  border-radius: var(--r-sm);
  color: #fff;
  background: rgba(255, 59, 78, 0.9);
  font-size: var(--fs-xs);
  font-weight: 700;
}
.card__caption {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  padding: 2.2rem var(--sp-3) var(--sp-3);
  background: var(--grad-caption);
}
.card__name {
  font-size: var(--fs-sm);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}
.card__meta {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
}
</style>
