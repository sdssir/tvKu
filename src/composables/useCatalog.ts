import { computed, ref, shallowRef } from 'vue'
import { CATALOG_TTL_MS } from '@/config/app'
import type { CatalogItem, Category, ContentKind, LiveChannel, SeriesItem, VodItem } from '@/types/iptv'
import { KEYS, readStorage, removeStorage, useStoredRef, writeStorage } from './useLocalStorage'
import { useAccount } from './useAccount'
import { nameQualityRank } from '@/services/quality'

/**
 * Every list the UI browses. Live TV loads at launch and is cached across
 * launches; Movies and Series — a real panel hands back 10–15 MB of JSON for
 * each — are fetched the first time their tab opens and then kept in memory.
 * Components never copy these arrays; the virtual lists index into them.
 */

interface LiveCache {
  savedAt: number
  categories: Category[]
  live: LiveChannel[]
}

export const ALL_CATEGORY = '__all__'
export const FAVORITES_CATEGORY = '__favorites__'
export const RECENT_CATEGORY = '__recent__'

const MAX_RECENTS = 30

const categories = shallowRef<Record<ContentKind, Category[]>>({ live: [], vod: [], series: [] })
const live = shallowRef<LiveChannel[]>([])
const vod = shallowRef<VodItem[]>([])
const series = shallowRef<SeriesItem[]>([])
const loaded = ref<Record<ContentKind, boolean>>({ live: false, vod: false, series: false })
const loading = ref<Record<ContentKind, boolean>>({ live: false, vod: false, series: false })
const loadError = ref<string | null>(null)

/** Favourites and last-watched hold the items themselves, newest first. */
const favorites = useStoredRef<CatalogItem[]>(KEYS.favorites, [])
const recents = useStoredRef<CatalogItem[]>(KEYS.recents, [])
/** Playback position in seconds for VOD / episodes, keyed by item id. */
const resume = useStoredRef<Record<string, { at: number; duration: number }>>(KEYS.resume, {})
/** Frame size the TV actually decoded the last time an item played, keyed by item id. */
const quality = useStoredRef<Record<string, { w: number; h: number }>>(KEYS.quality, {})
/** Put channels whose name claims HD/4K ahead of the rest inside each category. */
const preferHd = useStoredRef<boolean>(KEYS.preferHd, true)

const isLoading = computed(() => loading.value.live || loading.value.vod || loading.value.series)

export function useCatalog() {
  const acct = useAccount()

  /** Launch: live channels, from cache when fresh. */
  async function load(force = false): Promise<void> {
    loadError.value = null
    if (acct.sourceType.value === 'm3u') {
      await loadPlaylist(force)
      return
    }
    if (!force) {
      const cached = readStorage<LiveCache | null>(KEYS.catalog, null)
      if (cached && Date.now() - cached.savedAt < CATALOG_TTL_MS) {
        categories.value = { ...categories.value, live: cached.categories }
        live.value = cached.live
        loaded.value.live = true
        return
      }
    }
    await ensure('live', force)
    if (force) {
      loaded.value.vod = loaded.value.series = false
      vod.value = []
      series.value = []
    }
  }

  async function loadPlaylist(force: boolean) {
    if (loaded.value.live && !force) return
    loading.value.live = true
    try {
      if (force) acct.playlist.value = null
      await acct.ensurePlaylist()
      const p = acct.playlist.value!
      categories.value = { live: p.liveCategories, vod: p.vodCategories, series: [] }
      live.value = p.live
      vod.value = p.vod
      series.value = []
      loaded.value = { live: true, vod: true, series: true }
    } catch (err) {
      loadError.value = (err as Error).message || 'Could not load the playlist'
    } finally {
      loading.value.live = false
    }
  }

  /** Fetch one kind's categories and list if not already in memory. */
  async function ensure(kind: ContentKind, force = false): Promise<void> {
    if ((loaded.value[kind] && !force) || loading.value[kind]) return
    const api = acct.api.value
    if (!api) return
    loading.value[kind] = true
    try {
      if (kind === 'live') {
        const cats = await api.liveCategories()
        const list = await api.liveStreams()
        categories.value = { ...categories.value, live: cats }
        live.value = list
        const cache: LiveCache = { savedAt: Date.now(), categories: cats, live: list }
        if (!writeStorage(KEYS.catalog, cache)) removeStorage(KEYS.catalog)
      } else if (kind === 'vod') {
        const cats = await api.vodCategories()
        const list = await api.vodStreams()
        categories.value = { ...categories.value, vod: cats }
        vod.value = list
      } else {
        const cats = await api.seriesCategories()
        const list = await api.series()
        categories.value = { ...categories.value, series: cats }
        series.value = list
      }
      loaded.value[kind] = true
    } catch (err) {
      loadError.value = (err as Error).message || `Could not load ${kind === 'vod' ? 'movies' : kind}`
    } finally {
      loading.value[kind] = false
    }
  }

  function reset() {
    categories.value = { live: [], vod: [], series: [] }
    live.value = []
    vod.value = []
    series.value = []
    loaded.value = { live: false, vod: false, series: false }
    loadError.value = null
  }

  /* ── browsing ───────────────────────────────────────────────────────── */

  function listFor(kind: ContentKind): CatalogItem[] {
    return kind === 'live' ? live.value : kind === 'vod' ? vod.value : series.value
  }

  /** Categories for a tab, with the synthetic All / Favourites / Recent rows in front. */
  function categoriesFor(kind: ContentKind): Category[] {
    return [
      { id: ALL_CATEGORY, name: 'All', kind },
      { id: FAVORITES_CATEGORY, name: 'Favourites', kind },
      { id: RECENT_CATEGORY, name: 'Recently watched', kind },
      ...categories.value[kind],
    ]
  }

  function itemsIn(kind: ContentKind, categoryId: string): CatalogItem[] {
    switch (categoryId) {
      case ALL_CATEGORY:
        // Never reordered: across a whole provider the "4K" names are mostly dead relays.
        return listFor(kind)
      case FAVORITES_CATEGORY:
        return favorites.value.filter((x) => x.kind === kind)
      case RECENT_CATEGORY:
        return recents.value.filter((x) => x.kind === kind)
      default:
        return hdFirst(
          kind,
          listFor(kind).filter((x) => x.categoryId === categoryId),
        )
    }
  }

  /**
   * Stable sort, so the provider's order survives inside each quality tier.
   * Live only, and only inside a real category: movie and series names carry
   * no such tags.
   */
  function hdFirst(kind: ContentKind, items: CatalogItem[]): CatalogItem[] {
    if (kind !== 'live' || !preferHd.value) return items
    return items
      .map((item, i) => ({ item, i, rank: nameQualityRank(item.name) }))
      .sort((a, b) => a.rank - b.rank || a.i - b.i)
      .map((x) => x.item)
  }

  function search(query: string, limit = 60): CatalogItem[] {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    const out: CatalogItem[] = []
    for (const list of [live.value, vod.value, series.value]) {
      for (const item of list) {
        if (item.name.toLowerCase().includes(q)) {
          out.push(item)
          if (out.length >= limit) return out
        }
      }
    }
    return out
  }

  /* ── favourites / recents / resume ──────────────────────────────────── */

  const isFavorite = (id: string) => favorites.value.some((x) => x.id === id)
  function toggleFavorite(item: CatalogItem) {
    favorites.value = isFavorite(item.id) ? favorites.value.filter((x) => x.id !== item.id) : [item, ...favorites.value]
  }

  function markWatched(item: CatalogItem) {
    recents.value = [item, ...recents.value.filter((x) => x.id !== item.id)].slice(0, MAX_RECENTS)
  }

  function savePosition(id: string, at: number, duration: number) {
    if (!Number.isFinite(at) || !Number.isFinite(duration) || duration <= 0) return
    // Near the end counts as finished.
    if (at < 30 || at > duration - 60) {
      if (resume.value[id]) {
        const next = { ...resume.value }
        delete next[id]
        resume.value = next
      }
      return
    }
    resume.value = { ...resume.value, [id]: { at: Math.floor(at), duration: Math.floor(duration) } }
  }
  const positionFor = (id: string) => resume.value[id] ?? null

  function saveQuality(id: string, w: number, h: number) {
    if (!w || !h) return
    const cur = quality.value[id]
    if (cur && cur.w === w && cur.h === h) return
    quality.value = { ...quality.value, [id]: { w, h } }
  }
  const qualityFor = (id: string) => quality.value[id] ?? null

  return {
    loading,
    loaded,
    isLoading,
    loadError,
    categories,
    live,
    vod,
    series,
    load,
    ensure,
    reset,
    listFor,
    categoriesFor,
    itemsIn,
    search,
    favorites,
    recents,
    isFavorite,
    toggleFavorite,
    markWatched,
    savePosition,
    positionFor,
    saveQuality,
    qualityFor,
    preferHd,
  }
}
