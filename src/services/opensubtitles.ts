import { requestUrl } from './http'

/**
 * OpenSubtitles REST API (api.opensubtitles.com/api/v1). Needs a free API key
 * from opensubtitles.com/consumers; an account login lifts the daily download
 * quota. The TV is exempt from CORS; the dev proxy forwards these headers.
 *
 * The download quota is counted per account (per IP address without one),
 * never per API key. So the key is the app's identity and there is one of it;
 * accounts are what a viewer can have several of, and `downloadAcross` walks
 * them in order once one has used up its day.
 */

const BASE = 'https://api.opensubtitles.com/api/v1'

export interface OsLogin {
  username: string
  password: string
}

/** Subtitle settings for every provider; the storage shape under `KEYS.subtitles`. */
export interface OsConfig {
  /** OpenSubtitles API key; empty disables that provider. */
  apiKey: string
  /** Account logins tried in order; empty means anonymous. */
  logins: OsLogin[]
  /** SubDL API key; empty disables that provider. */
  subdlKey: string
  /** Comma-separated ISO 639-1 codes in preference order, e.g. "en,ms". */
  languages: string
}

/**
 * Settings saved before logins became a list carried one username/password
 * pair at the top level; fold that into `logins` and fill anything missing.
 */
export function normaliseConfig(raw: unknown): OsConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<OsConfig> & { username?: string; password?: string }
  const logins: OsLogin[] = Array.isArray(r.logins)
    ? r.logins
        .filter((l): l is OsLogin => !!l && typeof l === 'object')
        .map((l) => ({ username: String(l.username ?? ''), password: String(l.password ?? '') }))
    : []
  if (!logins.length && (r.username || r.password)) logins.push({ username: r.username ?? '', password: r.password ?? '' })
  return {
    apiKey: typeof r.apiKey === 'string' ? r.apiKey : '',
    logins,
    subdlKey: typeof r.subdlKey === 'string' ? r.subdlKey : '',
    languages: typeof r.languages === 'string' ? r.languages : 'en,ms',
  }
}

/** The account (or IP) has no downloads left until `resetAt` (epoch ms), when the API said. */
export class QuotaError extends Error {
  constructor(
    message: string,
    public readonly resetAt: number | null,
  ) {
    super(message)
    this.name = 'QuotaError'
  }
}

function parseReset(v: unknown): number | null {
  if (typeof v !== 'string') return null
  const t = Date.parse(v)
  return Number.isNaN(t) ? null : t
}

const DAY = 24 * 60 * 60 * 1000

function clock(t: number): string {
  return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export interface Downloader {
  download(ref: string): Promise<DownloadResult>
}

/**
 * Download `ref` with the first account that still has quota, in the order
 * given. `spent` maps an account id to when its quota resets; an account whose
 * reset is still ahead is skipped without a request, one that answers 406 (or
 * hands back its last download) is recorded, and the next is tried. The
 * returned `spent` replaces the caller's copy. When every account is out, the
 * error names the earliest reset.
 */
export async function downloadAcross(
  accounts: Array<{ id: string; client: Downloader }>,
  spent: Record<string, number>,
  ref: string,
  now = Date.now(),
): Promise<{ result: DownloadResult; id: string; spent: Record<string, number> }> {
  const next: Record<string, number> = {}
  for (const [id, at] of Object.entries(spent)) if (at > now) next[id] = at
  for (const { id, client } of accounts) {
    if (next[id] !== undefined) continue
    try {
      const result = await client.download(ref)
      if (result.remaining === 0) next[id] = result.resetAt ?? now + DAY
      return { result, id, spent: next }
    } catch (err) {
      if (!(err instanceof QuotaError)) throw err
      next[id] = err.resetAt ?? now + DAY
    }
  }
  const resets = accounts.map((a) => next[a.id]).filter((t): t is number => t !== undefined)
  const soonest = resets.length ? Math.min(...resets) : null
  const who = accounts.length > 1 ? `all ${accounts.length} OpenSubtitles logins` : 'OpenSubtitles'
  throw new QuotaError(`Download limit reached for today on ${who}${soonest ? `; resets at ${clock(soonest)}` : ''}`, soonest)
}

export type SubtitleProvider = 'opensubtitles' | 'subdl'

/** One downloadable subtitle from any provider; `provider` + `ref` say where. */
export interface SubtitleHit {
  provider: SubtitleProvider
  /** Provider-specific handle: the OpenSubtitles file id, or a SubDL download path. */
  ref: string
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

/** Language preference decides the group; quality decides the order inside it (stable, so a provider's own order survives ties). */
export function sortHits(hits: SubtitleHit[], languages: string): SubtitleHit[] {
  const order = languages.split(',').map((s) => s.trim().toLowerCase())
  const rank = (l: string) => {
    const i = order.indexOf(l)
    return i < 0 ? order.length : i
  }
  return hits.sort((x, y) => rank(x.language) - rank(y.language) || qualityScore(y) - qualityScore(x))
}

export interface DownloadResult {
  srt: string
  fileName: string
  /** Downloads left today, or null when the API did not say. */
  remaining: number | null
  /** When today's quota resets (epoch ms), or null when the API did not say. */
  resetAt: number | null
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

export class OpenSubtitles implements Downloader {
  private token: string | null = null
  private loginOnce: Promise<boolean> | null = null

  constructor(
    private readonly cfg: Pick<OsConfig, 'apiKey' | 'languages'>,
    private readonly account: OsLogin | null = null,
  ) {}

  /** The username this client acts as; empty when anonymous. */
  get username(): string {
    return this.account?.username.trim() ?? ''
  }

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
        let body: { message?: string; reset_time_utc?: string } = {}
        try {
          body = JSON.parse(text) as typeof body
          if (body.message) msg = `OpenSubtitles: ${body.message}`
        } catch {
          /* keep the status */
        }
        if (res.status === 401 || res.status === 403) msg = 'OpenSubtitles rejected the API key'
        if (res.status === 406) {
          const who = this.username ? ` for ${this.username}` : ''
          throw new QuotaError(`OpenSubtitles download limit reached for today${who}`, parseReset(body.reset_time_utc))
        }
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

  /**
   * Optional; only raises the daily quota. Runs once per client and every
   * request waits for it, so a download never goes out anonymous (against the
   * shared IP quota) just because the login had not answered yet. Silent
   * failure keeps search working.
   */
  login(): Promise<boolean> {
    if (!this.loginOnce) this.loginOnce = this.doLogin()
    return this.loginOnce
  }

  private async doLogin(): Promise<boolean> {
    if (!this.account?.username.trim() || !this.account.password) return false
    try {
      const r = await this.call<{ token?: string }>('/login', {
        method: 'POST',
        body: JSON.stringify({ username: this.account.username.trim(), password: this.account.password }),
      })
      this.token = r.token ?? null
      return !!this.token
    } catch {
      return false
    }
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    await this.login()
    return this.call<T>(path, init)
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
    const r = await this.request<{
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
        provider: 'opensubtitles',
        ref: String(file.file_id),
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
    return sortHits(hits, this.cfg.languages)
  }

  /** `ref` is the file id from `search`. */
  async download(ref: string): Promise<DownloadResult> {
    const fileId = Number(ref)
    const r = await this.request<{
      link?: string
      file_name?: string
      remaining?: number
      reset_time_utc?: string
      message?: string
    }>('/download', {
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
      resetAt: parseReset(r.reset_time_utc),
    }
  }
}
