<script setup lang="ts">
import { computed } from 'vue'
import Icon, { type IconName } from './Icon.vue'
import { ALL_CATEGORY, FAVORITES_CATEGORY, RECENT_CATEGORY } from '@/composables/useCatalog'

/**
 * A glyph for a provider category, guessed from its name. Providers name
 * categories freely, so this is keyword matching with a sane default.
 */
const props = defineProps<{ id: string; name: string }>()

const RULES: Array<[RegExp, IconName]> = [
  [/usa|canada|america|\bus\b/i, 'flag-us'],
  [/\buk\b|british|england|sky sports|premier/i, 'flag-uk'],
  [/sport|bein|football|soccer|nba|nfl|ufc|cricket|golf|f1|racing/i, 'ball'],
  [/netflix|movie|film|cinema|hbo|disney/i, 'reel'],
  [/news|berita|cnn|bbc/i, 'news'],
  [/kid|cartoon|anime|少儿|children/i, 'kids'],
  [/document|discovery|natgeo|纪实|history/i, 'doc'],
  [/malay|\bmy\b|马来|astro|rtm|tv3|malaysia/i, 'star'],
  [/indo|india|thai|arab|turk|philip|korea|china|japan|viet|international|world|africa|europe|latino|yupptv/i, 'globe'],
]

const icon = computed<IconName>(() => {
  if (props.id === ALL_CATEGORY) return 'grid'
  if (props.id === FAVORITES_CATEGORY) return 'heart'
  if (props.id === RECENT_CATEGORY) return 'clock'
  for (const [re, name] of RULES) if (re.test(props.name)) return name
  return 'tv'
})
</script>

<template>
  <Icon :name="icon" class="cat-icon" :class="{ 'is-flag': icon.startsWith('flag-') }" />
</template>

<style scoped>
.cat-icon {
  width: 1.5rem;
  height: 1.5rem;
}
.cat-icon.is-flag {
  width: 1.7rem;
}
</style>
