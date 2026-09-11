<script setup lang="ts">
import { computed, onMounted, shallowRef, watch } from 'vue'
import { NAV_TABS, type NavTabId } from '@/config/app'
import { useAccount } from '@/composables/useAccount'
import { useCatalog } from '@/composables/useCatalog'
import { usePlayer } from '@/composables/usePlayer'
import { useToast } from '@/composables/useToast'
import { useTvNavigation } from '@/composables/useTvNavigation'
import { KEYS, useStoredRef } from '@/composables/useLocalStorage'
import type { CatalogItem, SeriesItem, VodItem } from '@/types/iptv'
import LoginScreen from '@/components/LoginScreen.vue'
import SideNav from '@/components/SideNav.vue'
import LiveView from '@/components/LiveView.vue'
import MediaView from '@/components/MediaView.vue'
import FavoritesView from '@/components/FavoritesView.vue'
import SettingsView from '@/components/SettingsView.vue'
import VodDetail from '@/components/VodDetail.vue'
import SeriesDetail from '@/components/SeriesDetail.vue'
import PlayerScreen from '@/components/PlayerScreen.vue'
import StatusToast from '@/components/StatusToast.vue'

const acct = useAccount()
const catalog = useCatalog()
const player = usePlayer()
const toast = useToast()

const tab = useStoredRef<NavTabId>(KEYS.lastTab, 'live')
if (!NAV_TABS.some((t) => t.id === tab.value)) tab.value = 'live'

const detail = shallowRef<VodItem | SeriesItem | null>(null)
const screen = computed(() => (acct.isSignedIn.value ? 'home' : 'login'))

/**
 * Back, narrowest state first. The full-screen player and detail overlays
 * handle their own; then a running preview stops; then a non-default tab
 * returns to Live TV; then webOS exits the app.
 */
const nav = useTvNavigation({
  onBack: () => {
    if (screen.value !== 'home') return false
    if (player.isPreviewing.value) {
      player.close()
      return true
    }
    if (tab.value !== 'live') {
      setTab('live')
      return true
    }
    return false
  },
})

function setTab(id: NavTabId) {
  tab.value = id
  void nav.reanchorFocus(`nav-${id}`)
}

function open(item: CatalogItem) {
  if (item.kind === 'live') {
    // From favourites: play it with its own category as the zap list.
    const list = catalog.itemsIn('live', item.categoryId).filter((x): x is typeof item => x.kind === 'live')
    const idx = list.findIndex((x) => x.id === item.id)
    void player.playLive(list, Math.max(0, idx))
    return
  }
  detail.value = item
}

function closeDetail() {
  nav.popOverlay(detail.value?.kind === 'vod' ? 'vod-detail' : 'series-detail')
  detail.value = null
  void nav.reanchorFocus(null, /-grid$/)
}

async function boot() {
  if (!acct.isSignedIn.value) return
  await catalog.load()
  if (catalog.loadError.value) toast.show(catalog.loadError.value, 'bad', 8000)
  void acct.refreshAccount()
  void nav.reanchorFocus(null, /^live-list$|-grid$/)
}

onMounted(boot)

watch(screen, (s) => {
  if (s === 'home') void boot()
  else void nav.reanchorFocus('login-mode-xtream')
})

// Leaving full screen: put the remote back where it was.
watch(
  () => player.isOpen.value,
  (open) => {
    if (!open) void nav.reanchorFocus(null, /^detail-play$|^episodes$|^live-list$|-grid$/)
  },
)
</script>

<template>
  <LoginScreen v-if="screen === 'login'" />

  <!-- Hidden (not removed) while full screen, so the Live tab keeps its state and the preview rect. -->
  <div v-else class="shell" :class="{ 'is-covered': player.isOpen.value }" :inert="detail !== null || player.isOpen.value ? true : undefined">
    <SideNav :active="tab" @change="setTab" />
    <main class="shell__main">
      <div v-if="catalog.loading.value.live && !catalog.live.value.length" class="loading-block">
        <span class="spinner"></span>
        <p>Loading your channels…</p>
      </div>
      <template v-else>
        <LiveView v-if="tab === 'live'" />
        <MediaView v-else-if="tab === 'movies'" kind="vod" @open="open" />
        <MediaView v-else-if="tab === 'series'" kind="series" @open="open" />
        <FavoritesView v-else-if="tab === 'favorites'" @open="open" />
        <SettingsView v-else @signed-out="setTab('live')" />
      </template>
    </main>
  </div>

  <!-- Detail pages are opaque overlays above the video stage: hide them too while playing. -->
  <VodDetail v-if="detail?.kind === 'vod'" :item="detail" :class="{ 'is-covered': player.isOpen.value }" @close="closeDetail" />
  <SeriesDetail v-else-if="detail?.kind === 'series'" :item="detail" :class="{ 'is-covered': player.isOpen.value }" @close="closeDetail" />

  <PlayerScreen v-if="player.isOpen.value" />
  <StatusToast />
</template>

<style scoped>
/*
 * The shell is transparent: the video stage sits beneath it (z-index 0) and
 * the Live TV preview box is the hole it shows through. Anything opaque here
 * would cover it.
 */
.shell {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: var(--rail-w) 1fr;
  height: 100%;
  background: transparent;
}
.shell.is-covered {
  visibility: hidden;
}
.shell__main {
  min-width: 0;
  min-height: 0;
  padding: var(--safe-y) var(--safe-x) var(--safe-y) var(--sp-6);
}
</style>
