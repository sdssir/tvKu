/** Single source of truth for app identity. Keep in sync with public/appinfo.json. */
export const APP = {
  id: 'com.jul.tvku',
  version: '1.2.1',
  title: 'tvKu',
  tagline: 'TV for Everyone',
  railNote: 'Malaysian Entertainment Always With You',
  slogan: 'Good shows · A brighter tomorrow',
  liveSubtitle: 'Malaysia & International',
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

/**
 * SubDL key shipped with the app (free tier: 2,000 searches and 50 keyed
 * downloads a day). Filled into Settings when no key is stored, so subtitles
 * work out of the box; Settings shows it locked and masked.
 */
export const DEFAULT_SUBDL_KEY = 'subdl_E1bH-_v6A3osq2Fh1KZ0aiUgB-aoZAzdrawnpzblltg'

/** Catalogue lists are cached this long before a relaunch refetches them. */
export const CATALOG_TTL_MS = 6 * 60 * 60 * 1000
export const LIVE_ROW_REM = 4.4
export const POSTER_COLUMNS = 6
