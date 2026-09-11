import { fetchJson } from './http'
import type {
  AccountInfo,
  Category,
  EpgEntry,
  Episode,
  LiveChannel,
  Season,
  SeriesDetails,
  SeriesItem,
  StreamFormat,
  VodDetails,
  VodItem,
} from '@/types/iptv'

/**
 * Xtream Codes "player_api" client — the same protocol IPTV Smarters speaks.
 *
 * Everything the panel returns is loosely typed (numbers arrive as strings,
 * missing fields as "" or null, episode maps as objects or arrays), so each
 * response is normalised here and nothing downstream touches raw panel JSON.
 */

export interface XtreamConfig {
  server: string
  username: string
  password: string
}

/** Strip whatever the user pasted down to `scheme://host[:port]`. */
export function normalizeServer(input: string): string {
  let s = input.trim()
  if (!s) throw new Error('Server URL is required')
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`
  const u = new URL(s)
  return `${u.protocol}//${u.host}`
}

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v))
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const orNull = (v: unknown): string | null => {
  const s = str(v).trim()
  return s ? s : null
}
const year = (v: unknown): string | null => {
  const m = str(v).match(/\d{4}/)
  return m ? m[0] : null
}

/** EPG titles/descriptions are base64 with UTF-8 inside. */
export function decodeBase64(s: string): string {
  try {
    const bin = atob(s)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new TextDecoder().decode(bytes)
  } catch {
    return s
  }
}

export class XtreamApi {
  readonly server: string
  constructor(private readonly cfg: XtreamConfig) {
    this.server = normalizeServer(cfg.server)
  }

  private api(params: Record<string, string> = {}): string {
    const q = new URLSearchParams({
      username: this.cfg.username,
      password: this.cfg.password,
      ...params,
    })
    return `${this.server}/player_api.php?${q}`
  }

  /* ── URLs ───────────────────────────────────────────────────────────── */

  liveUrl(streamId: string, format: StreamFormat): string {
    const { username: u, password: p } = this.cfg
    return `${this.server}/live/${u}/${p}/${streamId}.${format}`
  }

  vodUrl(streamId: string, ext: string): string {
    const { username: u, password: p } = this.cfg
    return `${this.server}/movie/${u}/${p}/${streamId}.${ext || 'mp4'}`
  }

  episodeUrl(episodeId: string, ext: string): string {
    const { username: u, password: p } = this.cfg
    return `${this.server}/series/${u}/${p}/${episodeId}.${ext || 'mp4'}`
  }

  /* ── account ────────────────────────────────────────────────────────── */

  async login(): Promise<AccountInfo> {
    const raw = await fetchJson<{
      user_info?: Record<string, unknown>
      server_info?: Record<string, unknown>
    }>(this.api())
    const ui = raw.user_info
    if (!ui) throw new Error('Not an Xtream Codes server')
    if (str(ui.auth) === '0') throw new Error('Wrong username or password')
    const exp = num(ui.exp_date)
    return {
      username: str(ui.username) || this.cfg.username,
      status: str(ui.status) || 'Unknown',
      expiresAt: exp ? exp * 1000 : null,
      isTrial: str(ui.is_trial) === '1',
      activeConnections: num(ui.active_cons) ?? 0,
      maxConnections: num(ui.max_connections) ?? 0,
      serverTimezone: orNull(raw.server_info?.timezone),
    }
  }

  /* ── categories ─────────────────────────────────────────────────────── */

  private async categories(action: string, kind: Category['kind']): Promise<Category[]> {
    const raw = await fetchJson<unknown>(this.api({ action }))
    if (!Array.isArray(raw)) return []
    return raw
      .map((c: Record<string, unknown>) => ({
        id: str(c.category_id),
        name: str(c.category_name).trim() || 'Untitled',
        kind,
      }))
      .filter((c) => c.id)
  }

  liveCategories = () => this.categories('get_live_categories', 'live')
  vodCategories = () => this.categories('get_vod_categories', 'vod')
  seriesCategories = () => this.categories('get_series_categories', 'series')

  /* ── lists ──────────────────────────────────────────────────────────── */

  async liveStreams(): Promise<LiveChannel[]> {
    const raw = await fetchJson<unknown>(this.api({ action: 'get_live_streams' }), 60_000)
    if (!Array.isArray(raw)) return []
    return raw
      .map((s: Record<string, unknown>, i): LiveChannel => ({
        kind: 'live',
        id: `live:${str(s.stream_id)}`,
        num: num(s.num) ?? i + 1,
        name: str(s.name).trim() || `Channel ${i + 1}`,
        logo: orNull(s.stream_icon),
        categoryId: str(s.category_id),
        epgChannelId: orNull(s.epg_channel_id),
        streamId: str(s.stream_id),
      }))
      .filter((c) => c.streamId)
  }

  async vodStreams(): Promise<VodItem[]> {
    const raw = await fetchJson<unknown>(this.api({ action: 'get_vod_streams' }), 60_000)
    if (!Array.isArray(raw)) return []
    return raw
      .map(
        (s: Record<string, unknown>): VodItem => ({
          kind: 'vod',
          id: `vod:${str(s.stream_id)}`,
          name: str(s.name).trim() || 'Untitled',
          poster: orNull(s.stream_icon),
          categoryId: str(s.category_id),
          rating: num(s.rating),
          year: year(s.year ?? s.releasedate ?? s.release_date) ?? yearInName(str(s.name)),
          streamId: str(s.stream_id),
          containerExtension: str(s.container_extension) || 'mp4',
          added: num(s.added),
        }),
      )
      .filter((v) => v.streamId)
  }

  async series(): Promise<SeriesItem[]> {
    const raw = await fetchJson<unknown>(this.api({ action: 'get_series' }), 60_000)
    if (!Array.isArray(raw)) return []
    return raw
      .map(
        (s: Record<string, unknown>): SeriesItem => ({
          kind: 'series',
          id: `series:${str(s.series_id)}`,
          name: str(s.name).trim() || 'Untitled',
          poster: orNull(s.cover),
          categoryId: str(s.category_id),
          rating: num(s.rating),
          year: year(s.year ?? s.releaseDate ?? s.release_date),
          plot: orNull(s.plot),
          seriesId: str(s.series_id),
        }),
      )
      .filter((v) => v.seriesId)
  }

  /* ── details ────────────────────────────────────────────────────────── */

  async vodInfo(vodId: string): Promise<VodDetails> {
    const raw = await fetchJson<{ info?: Record<string, unknown> }>(
      this.api({ action: 'get_vod_info', vod_id: vodId }),
    )
    const info = raw.info ?? {}
    return {
      plot: orNull(info.plot ?? info.description),
      cast: orNull(info.cast ?? info.actors),
      director: orNull(info.director),
      genre: orNull(info.genre),
      duration: orNull(info.duration),
      releaseDate: orNull(info.releasedate ?? info.release_date),
      backdrop: firstBackdrop(info.backdrop_path),
    }
  }

  async seriesInfo(seriesId: string): Promise<SeriesDetails> {
    const raw = await fetchJson<{
      info?: Record<string, unknown>
      seasons?: Array<Record<string, unknown>>
      episodes?: Record<string, unknown[]> | unknown[][]
    }>(this.api({ action: 'get_series_info', series_id: seriesId }))
    const info = raw.info ?? {}
    const seasonNames = new Map<number, string>()
    for (const s of raw.seasons ?? []) {
      const n = num(s.season_number)
      if (n !== null) seasonNames.set(n, str(s.name).trim())
    }

    // Panels return `episodes` as {"1":[...]} or, less often, as [[...]].
    const groups: unknown[][] = Array.isArray(raw.episodes)
      ? raw.episodes
      : Object.values(raw.episodes ?? {})

    const seasons = new Map<number, Season>()
    for (const group of groups) {
      if (!Array.isArray(group)) continue
      for (const e of group as Array<Record<string, unknown>>) {
        const seasonNumber = num(e.season) ?? 1
        const info = (e.info ?? {}) as Record<string, unknown>
        const ep: Episode = {
          id: str(e.id),
          seasonNumber,
          episodeNumber: num(e.episode_num) ?? 0,
          title: str(e.title).trim() || `Episode ${str(e.episode_num)}`,
          containerExtension: str(e.container_extension) || 'mp4',
          thumbnail: orNull(info.movie_image),
          plot: orNull(info.plot),
          duration: orNull(info.duration),
        }
        if (!ep.id) continue
        let season = seasons.get(seasonNumber)
        if (!season) {
          season = {
            number: seasonNumber,
            name: seasonNames.get(seasonNumber) || `Season ${seasonNumber}`,
            episodes: [],
          }
          seasons.set(seasonNumber, season)
        }
        season.episodes.push(ep)
      }
    }
    const ordered = [...seasons.values()].sort((a, b) => a.number - b.number)
    ordered.forEach((s) => s.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber))

    return {
      plot: orNull(info.plot),
      cast: orNull(info.cast),
      genre: orNull(info.genre),
      releaseDate: orNull(info.releaseDate ?? info.release_date),
      backdrop: firstBackdrop(info.backdrop_path),
      seasons: ordered,
    }
  }

  /* ── EPG ────────────────────────────────────────────────────────────── */

  async shortEpg(streamId: string, limit = 4): Promise<EpgEntry[]> {
    const raw = await fetchJson<{ epg_listings?: Array<Record<string, unknown>> }>(
      this.api({ action: 'get_short_epg', stream_id: streamId, limit: String(limit) }),
      10_000,
    )
    return (raw.epg_listings ?? [])
      .map((e) => ({
        title: decodeBase64(str(e.title)),
        description: decodeBase64(str(e.description)),
        start: epgTime(e.start, e.start_timestamp),
        end: epgTime(e.end, e.stop_timestamp),
      }))
      .filter((e) => e.start && e.end)
  }
}

/** Panels commonly put the year in the title only: "The Marksman (2021)". */
function yearInName(name: string): string | null {
  const m = name.match(/\((19|20)\d{2}\)/)
  return m ? m[0].slice(1, -1) : null
}

/**
 * Programme times. Panels emit `start`/`end` as "YYYY-MM-DD HH:MM:SS" in the
 * server's local time and then compute the *_timestamp fields as if that
 * string were UTC, so the timestamps are off by the server's UTC offset.
 * Parsing the string as local time is right whenever the TV sits in the same
 * timezone as the provider — the normal case — and the timestamp is the fallback.
 */
function epgTime(text: unknown, timestamp: unknown): number {
  const s = str(text).trim()
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s)) {
    const t = new Date(s.replace(' ', 'T')).getTime()
    if (Number.isFinite(t)) return t
  }
  return (num(timestamp) ?? 0) * 1000
}

function firstBackdrop(v: unknown): string | null {
  if (Array.isArray(v)) return orNull(v[0])
  return orNull(v)
}
