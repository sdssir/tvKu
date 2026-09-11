<script setup lang="ts">
/** Inline SVG icons — no icon font, no network. 24-unit grid, stroke based. */
defineProps<{ name: IconName }>()

export type IconName =
  | 'live'
  | 'film'
  | 'series'
  | 'heart'
  | 'heart-filled'
  | 'settings'
  | 'search'
  | 'sort'
  | 'play'
  | 'pause'
  | 'expand'
  | 'clock'
  | 'back'
  | 'subtitles'
  | 'check'
  | 'chevron-down'
  | 'star'
  | 'info'
</script>

<template>
  <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="name === 'live'"><rect x="3" y="5" width="18" height="13" rx="2" /><path d="M8 21h8M12 18v3" /><path d="M8 5l4-3 4 3" /></template>
    <template v-else-if="name === 'film'"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" /></template>
    <template v-else-if="name === 'series'"><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M7 3l5 4 5-4" /><path d="M10 11l5 3-5 3z" fill="currentColor" stroke="none" /></template>
    <template v-else-if="name === 'heart'"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.5 4.5 7 4.5c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3.5 0 5.6 3.5 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" /></template>
    <template v-else-if="name === 'heart-filled'"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.5 4.5 7 4.5c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3.5 0 5.6 3.5 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" fill="currentColor" /></template>
    <template v-else-if="name === 'settings'"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></template>
    <template v-else-if="name === 'search'"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></template>
    <template v-else-if="name === 'sort'"><path d="M4 6h16M7 12h10M10 18h4" /></template>
    <template v-else-if="name === 'play'"><path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none" /></template>
    <template v-else-if="name === 'pause'"><rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none" /><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none" /></template>
    <template v-else-if="name === 'expand'"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></template>
    <template v-else-if="name === 'clock'"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></template>
    <template v-else-if="name === 'back'"><path d="M15 5l-7 7 7 7" /></template>
    <template v-else-if="name === 'subtitles'"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 13h4M13 13h4M7 16h2M11 16h6" /></template>
    <template v-else-if="name === 'check'"><path d="M5 12l5 5L20 7" /></template>
    <template v-else-if="name === 'chevron-down'"><path d="M6 9l6 6 6-6" /></template>
    <template v-else-if="name === 'star'"><path d="M12 3l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.4l-5.7 3.1 1.2-6.4L2.8 9.7l6.4-.8z" fill="currentColor" stroke="none" /></template>
    <template v-else-if="name === 'info'"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></template>
  </svg>
</template>

<style>
.icon {
  display: inline-block;
  width: 1.25rem;
  height: 1.25rem;
  flex: none;
  vertical-align: -0.2em;
}
</style>
