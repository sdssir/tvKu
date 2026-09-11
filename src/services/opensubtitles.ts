import { requestUrl } from './http'

/**
 * OpenSubtitles REST API (api.opensubtitles.com/api/v1). Needs a free API key
 * from opensubtitles.com/consumers; an account login lifts the daily download
 * quota. The TV is exempt from CORS; the dev proxy forwards these headers.
 */

const BASE = 'https://api.opensubtitles.com/api/v1'

export interface OsConfig {
  apiKey: string
  username?: string
  password?: string
  /** Comma-separated ISO 639-1 codes in preference order, e.g. "en,ms". */
  languages: string
}

export interface SubtitleHit {
  fileId: number
  language: string
  release: string
  downloads: number
  hearingImpaired: boolean
  /** The title OpenSubtitles matched, so a wrong match is visible. */
  matched: string
  /** Community rating 0-10, and how many people voted for it. */
  ratings: number
  votes: number
  /** Uploaded by an account OpenSubtitles marks as trusted. */
  fromTrusted: boolean
  hd: boolean
  /** Produced by a machine rather than a person — usually poor. */
  autoTranslated: boolean
  uploader: string
}

/**
 * How good a subtitle looks, higher is better. Ordering inside a language:
 *
 * - Machine or AI translations are pushed to the bottom; they read badly and
 *   are the one signal worth treating as disqualifying.
 * - A trusted uploader outweighs raw popularity.
 * - A rating only counts when somebody actually voted — the API reports an
 *   unrated file as 0.0, which must not read as "rated zero" — and it counts
 *   more as the number of votes grows.
 * - Download count stands in for the crowd's verdict, on a log scale so a
 *   300k file beats a 30k one without burying everything else.
 * - Hearing-impaired files carry sound descriptions most viewers do not want,
 *   so they lose a hair; they stay in the list and stay selectable.
 */
export function qualityScore(h: SubtitleHit): number {
  let score = 0
  if (h.autoTranslated) score -= 10
  if (h.fromTrusted) score += 3
  if (h.hd) score += 0.5
  if (h.hearingImpaired) score -= 0.5
  if (h.votes > 0) score += (h.ratings / 10) * 3 * (Math.min(h.votes, 10) / 10)
  score += Math.log10(Math.max(0, h.downloads) + 1)
  return score
}

export interface DownloadResult {
  srt: string
  fileName: string
  /** Downloads left today, or null when the API did not say. */
  remaining: number | null
}

export type SubtitleQuery =
  | { kind: 'movie'; title: string; year: string | null; tmdbId?: string | null }
  | { kind: 'episode'; title: string; season: number; episode: number; tmdbId?: string | null }

/** Panels decorate names with "(2022)[BM]", "4k", "(my)" — strip that before searching. */
export function cleanTitle(name: string): string {
  return name
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\((?:19|20)\d{2}\)/g, ' ')
    .replace(/\((?:my|eng|en|bm|ind|chi|tam|hin)\)/gi, ' ')
    .replace(/\b(4k|uhd|2160p|1080p|720p|hd|fhd|hdr|web-?dl|bluray|x26[45]|hevc)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export class OpenSubtitles {
  private token: string | null = null

  constructor(private readonly cfg: OsConfig) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      'Api-Key': this.cfg.apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      // Browsers refuse to set User-Agent; the API accepts this instead.
      'X-User-Agent': 'tvKu v1.0.0',
    }
    if (this.token) h.Authorization = `Bearer ${this.token}`
    return h
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 20_000)
    try {
      const res = await fetch(requestUrl(`${BASE}${path}`), { ...init, headers: this.headers(), signal: ctl.signal })
      const text = await res.text()
      if (!res.ok) {
        let msg = `OpenSubtitles: HTTP ${res.status}`
        try {
          const j = JSON.parse(text) as { message?: string }
          if (j.message) msg = `OpenSubtitles: ${j.message}`
        } catch {
          /* keep the status */
        }
        if (res.status === 401 || res.status === 403) msg = 'OpenSubtitles rejected the API key'
        if (res.status === 406) msg = 'OpenSubtitles download limit reached for today'
        throw new Error(msg)
      }
      return JSON.parse(text) as T
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw new Error('OpenSubtitles timed out')
      throw err
    } finally {
      clearTimeout(timer)
    }
  }

  /** Optional; only raises the daily quota. Silent failure keeps search working. */
  async login(): Promise<boolean> {
    if (!this.cfg.username || !this.cfg.password) return false
    try {
      const r = await this.call<{ token?: string }>('/login', {
        method: 'POST',
        body: JSON.stringify({ username: this.cfg.username, password: this.cfg.password }),
      })
      this.token = r.token ?? null
      return !!this.token
    } catch {
      return false
    }
  }

  async search(q: SubtitleQuery): Promise<SubtitleHit[]> {
    const params = new URLSearchParams({ languages: this.cfg.languages.replace(/\s/g, '') || 'en' })
    /*
     * A TMDB id is worth far more than the title. Free text matches on common
     * words - "The Wolf and the Lion" returns 3400 rows, mostly Shang-Chi and
     * Raya - while the id returns exactly the five files for that film. Text
     * is only the fallback for when the panel gave us no id.
     */
    if (q.tmdbId) {
      params.set('tmdb_id', q.tmdbId)
    } else {
      // The API canonicalises the query to lower case and 301s if it is not;
      // fetch would follow that, but sending it lower case saves the round-trip.
      params.set('query', cleanTitle(q.title).toLowerCase())
      if (q.kind === 'movie') {
        params.set('type', 'movie')
        if (q.year) params.set('year', q.year)
      } else {
        params.set('type', 'episode')
        params.set('season_number', String(q.season))
        params.set('episode_number', String(q.episode))
      }
    }
    params.set('order_by', 'download_count')
    params.set('order_direction', 'desc')
    const r = await this.call<{
      data?: Array<{
        attributes?: {
          language?: string
          release?: string
          download_count?: number
          hearing_impaired?: boolean
          ratings?: number
          votes?: number
          from_trusted?: boolean
          hd?: boolean
          ai_translated?: boolean
          machine_translated?: boolean
          uploader?: { name?: string }
          files?: Array<{ file_id?: number; file_name?: string }>
          feature_details?: { title?: string; movie_name?: string; year?: number }
        }
      }>
    }>(`/subtitles?${params}`)
    const hits: SubtitleHit[] = []
    for (const d of r.data ?? []) {
      const a = d.attributes ?? {}
      const file = a.files?.[0]
      if (!file?.file_id) continue
      const fd = a.feature_details ?? {}
      hits.push({
        fileId: file.file_id,
        language: (a.language ?? '?').toLowerCase(),
        release: (a.release || file.file_name || '').replace(/<br\s*\/?>/gi, ' ').trim(),
        downloads: a.download_count ?? 0,
        hearingImpaired: !!a.hearing_impaired,
        matched: fd.movie_name || [fd.title, fd.year].filter(Boolean).join(' ') || '',
        ratings: a.ratings ?? 0,
        votes: a.votes ?? 0,
        fromTrusted: !!a.from_trusted,
        hd: !!a.hd,
        autoTranslated: !!a.ai_translated || !!a.machine_translated,
        uploader: a.uploader?.name ?? '',
      })
    }
    // Language preference decides the group; quality decides the order inside it.
    const order = this.cfg.languages.split(',').map((s) => s.trim().toLowerCase())
    const rank = (l: string) => {
      const i = order.indexOf(l)
      return i < 0 ? order.length : i
    }
    hits.sort((x, y) => rank(x.language) - rank(y.language) || qualityScore(y) - qualityScore(x))
    return hits
  }

  async download(fileId: number): Promise<DownloadResult> {
    const r = await this.call<{ link?: string; file_name?: string; remaining?: number; message?: string }>('/download', {
      method: 'POST',
      body: JSON.stringify({ file_id: fileId, sub_format: 'srt' }),
    })
    if (!r.link) throw new Error(r.message || 'OpenSubtitles returned no file')
    const res = await fetch(requestUrl(r.link))
    if (!res.ok) throw new Error(`Subtitle file: HTTP ${res.status}`)
    const buf = await res.arrayBuffer()
    return {
      srt: new TextDecoder('utf-8').decode(buf),
      fileName: r.file_name ?? '',
      remaining: typeof r.remaining === 'number' ? r.remaining : null,
    }
  }
}
