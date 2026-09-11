/** Single source of truth for app identity. Keep in sync with public/appinfo.json. */
export const APP = {
  id: 'com.jul.tvku',
  version: '1.1.0',
  title: 'tvKu',
  storagePrefix: 'tvku:v1:',
} as const

export const NAV_TABS = [
  { id: 'live', label: 'Live TV', icon: 'live' },
  { id: 'movies', label: 'Movies', icon: 'film' },
  { id: 'series', label: 'Series', icon: 'series' },
  { id: 'favorites', label: 'Favourites', icon: 'heart' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
] as const

export type NavTabId = (typeof NAV_TABS)[number]['id']

/** Sort choices per tab; the first is the default. */
export const SORT_OPTIONS = {
  live: [
    { id: 'default', label: 'Provider order' },
    { id: 'hd', label: 'HD first' },
    { id: 'name', label: 'A – Z' },
  ],
  vod: [
    { id: 'latest', label: 'Latest added' },
    { id: 'name', label: 'A – Z' },
    { id: 'rating', label: 'Top rated' },
    { id: 'default', label: 'Provider order' },
  ],
  series: [
    { id: 'latest', label: 'Latest added' },
    { id: 'name', label: 'A – Z' },
    { id: 'rating', label: 'Top rated' },
    { id: 'default', label: 'Provider order' },
  ],
} as const

export type SortId = (typeof SORT_OPTIONS)[keyof typeof SORT_OPTIONS][number]['id']

/** Catalogue lists are cached this long before a relaunch refetches them. */
export const CATALOG_TTL_MS = 6 * 60 * 60 * 1000
export const LIVE_ROW_REM = 4.4
export const POSTER_COLUMNS = 6
