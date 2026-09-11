export type ContentKind = 'live' | 'vod' | 'series'

export interface Category {
  id: string
  name: string
  kind: ContentKind
}

export interface LiveChannel {
  kind: 'live'
  id: string
  /** Channel number as the provider lists it. */
  num: number
  name: string
  logo: string | null
  categoryId: string
  epgChannelId: string | null
  /** Provider-specific hook for building the stream URL. */
  streamId: string
  /** Set for M3U sources, where the URL is given rather than derived. */
  url?: string
}

export interface VodItem {
  kind: 'vod'
  id: string
  name: string
  poster: string | null
  categoryId: string
  rating: number | null
  year: string | null
  streamId: string
  containerExtension: string
  added: number | null
  url?: string
}

export interface SeriesItem {
  kind: 'series'
  id: string
  name: string
  poster: string | null
  categoryId: string
  rating: number | null
  year: string | null
  plot: string | null
  seriesId: string
}

export type CatalogItem = LiveChannel | VodItem | SeriesItem

export interface VodDetails {
  plot: string | null
  cast: string | null
  director: string | null
  genre: string | null
  duration: string | null
  releaseDate: string | null
  backdrop: string | null
}

export interface Episode {
  id: string
  seasonNumber: number
  episodeNumber: number
  title: string
  containerExtension: string
  thumbnail: string | null
  plot: string | null
  duration: string | null
  url?: string
}

export interface Season {
  number: number
  name: string
  episodes: Episode[]
}

export interface SeriesDetails {
  plot: string | null
  cast: string | null
  genre: string | null
  releaseDate: string | null
  backdrop: string | null
  seasons: Season[]
}

export interface EpgEntry {
  title: string
  description: string
  start: number // unix ms
  end: number
}

export interface AccountInfo {
  username: string
  status: string
  expiresAt: number | null
  isTrial: boolean
  activeConnections: number
  maxConnections: number
  serverTimezone: string | null
}

/** What the user typed on the login screen. */
export type Credentials =
  | { type: 'xtream'; server: string; username: string; password: string }
  | { type: 'm3u'; url: string }

export type StreamFormat = 'm3u8' | 'ts'
