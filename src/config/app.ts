/** Single source of truth for app identity. Keep in sync with public/appinfo.json. */
export const APP = {
  id: 'com.jul.tvku',
  version: '1.0.0',
  title: 'tvKu',
  storagePrefix: 'tvku:v1:',
} as const

export const NAV_TABS = [
  { id: 'live', label: 'Live TV' },
  { id: 'movies', label: 'Movies' },
  { id: 'series', label: 'Series' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'search', label: 'Search' },
  { id: 'settings', label: 'Settings' },
] as const

export type NavTabId = (typeof NAV_TABS)[number]['id']

/** Catalogue lists are cached this long before a relaunch refetches them. */
export const CATALOG_TTL_MS = 6 * 60 * 60 * 1000
/** Live channel row height / poster size drive the virtual lists. */
export const LIVE_ROW_REM = 4.5
export const POSTER_COLUMNS = 6
