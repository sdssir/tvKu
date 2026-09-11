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
  | 'grid'
  | 'globe'
  | 'ball'
  | 'crown'
  | 'news'
  | 'reel'
  | 'kids'
  | 'doc'
  | 'tv'
  | 'flag-us'
  | 'flag-uk'
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
    <template v-else-if="name === 'grid'"><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></template>
    <template v-else-if="name === 'globe'"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" /></template>
    <template v-else-if="name === 'ball'"><circle cx="12" cy="12" r="9" /><path d="M12 7l4.5 3.3-1.7 5.4H9.2L7.5 10.3z" /><path d="M12 3v4M16.5 10.3l3.8-1.2M14.8 15.7l2.4 3.2M9.2 15.7l-2.4 3.2M7.5 10.3L3.7 9.1" /></template>
    <template v-else-if="name === 'crown'"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" fill="currentColor" stroke="none" /></template>
    <template v-else-if="name === 'news'"><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M7 9h5v4H7zM14 9h3M14 13h3M7 16h10" /></template>
    <template v-else-if="name === 'reel'"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="6.5" r="1.4" /><circle cx="12" cy="17.5" r="1.4" /><circle cx="6.5" cy="12" r="1.4" /><circle cx="17.5" cy="12" r="1.4" /></template>
    <template v-else-if="name === 'kids'"><circle cx="12" cy="13" r="7" /><circle cx="9.5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="14.5" cy="12" r="1" fill="currentColor" stroke="none" /><path d="M9.5 15.5c1.5 1.3 3.5 1.3 5 0M8 6l2 2M16 6l-2 2" /></template>
    <template v-else-if="name === 'doc'"><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></template>
    <template v-else-if="name === 'tv'"><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M8 21h8M12 18v3" /></template>
    <template v-else-if="name === 'flag-us'"><g stroke="none"><rect x="2" y="5" width="20" height="14" rx="1.5" fill="#b22234" /><path d="M2 8h20M2 11h20M2 14h20M2 17h20" stroke="#fff" stroke-width="1.2" /><rect x="2" y="5" width="9" height="7.5" fill="#3c3b6e" /></g></template>
    <template v-else-if="name === 'flag-uk'"><g stroke="none"><rect x="2" y="5" width="20" height="14" rx="1.5" fill="#012169" /><path d="M2 5l20 14M22 5L2 19" stroke="#fff" stroke-width="2.6" /><path d="M2 5l20 14M22 5L2 19" stroke="#c8102e" stroke-width="1" /><path d="M12 5v14M2 12h20" stroke="#fff" stroke-width="3.4" /><path d="M12 5v14M2 12h20" stroke="#c8102e" stroke-width="1.8" /></g></template>
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
