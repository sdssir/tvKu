import { requestUrl } from './http'
import { cleanTitle, sortHits, type SubtitleHit, type SubtitleQuery } from './opensubtitles'
import { listZip, readZipEntry } from './zip'

/**
 * SubDL (api.subdl.com, v2 — subdl.com/developers). A free API key from the
 * SubDL account panel gives 2,000 searches a day. Downloads go to
 * dl.subdl.com *without* the key: sent with it they count against the key's
 * 50 a day, sent anonymously they count per IP address (about 300 a day),
 * which is the better deal for one TV. So there is no account juggling here.
 *
 * Search with `unpack=1` lists the raw subtitle files inside each archive,
 * each with its own direct link. Those are preferred; an entry without them
 * falls back to the archive itself, which `zip.ts` opens on the TV.
 */

const API = 'https://api.subdl.com/api/v2/subtitles/search'
const DL = 'https://dl.subdl.com'

interface SdFile {
  name?: string
  release_name?: string
  season?: number
  episode?: number
  language?: string
  hi?: boolean
  format?: string
  url?: string
}

interface SdSubtitle {
  release_name?: string
  name?: string
  author?: string
  url?: string
  season?: number
  episode?: number | null
  language?: string
  hi?: boolean
  full_season?: boolean
  unpack_files?: SdFile[]
}

interface SdResponse {
  status?: boolean
  /** v2 errors are an object; v1-style strings still show up on some paths. */
  error?: string | { code?: string; message?: string }
  message?: string
  results?: Array<{ name?: string; year?: number | null }>
  subtitles?: SdSubtitle[]
}

/** The response embeds the key in every link; keep it out of refs, caches and logs. */
function stripKey(url: string): string {
  return url.replace(/\?.*$/, '')
}

export class SubDL {
  constructor(private readonly cfg: { apiKey: string; languages: string }) {}

  async search(q: SubtitleQuery): Promise<SubtitleHit[]> {
    const params = new URLSearchParams({
      languages: (this.cfg.languages.replace(/\s/g, '') || 'en').toUpperCase(),
      subs_per_page: '30',
      unpack: '1',
    })
    // A TMDB id is only unique together with the type; v2 refuses it alone.
    params.set('type', q.kind === 'movie' ? 'movie' : 'tv')
    if (q.tmdbId) params.set('tmdb_id', q.tmdbId)
    else params.set('film_name', cleanTitle(q.title))
    if (q.kind === 'movie') {
      if (q.year && !q.tmdbId) params.set('year', q.year)
    } else {
      params.set('season', String(q.season))
      params.set('episode', String(q.episode))
    }
    const r = await this.call(`${API}?${params}`)
    const feature = r.results?.[0]
    const matched = feature ? [feature.name, feature.year].filter(Boolean).join(' ') : ''
    const hits: SubtitleHit[] = []
    const base = (s: SdSubtitle): Omit<SubtitleHit, 'ref' | 'release' | 'language' | 'hearingImpaired'> => ({
      provider: 'subdl',
      downloads: 0,
      matched,
      ratings: 0,
      votes: 0,
      fromTrusted: false,
      hd: false,
      autoTranslated: false,
      uploader: s.author ?? '',
    })
    for (const s of r.subtitles ?? []) {
      const files = (s.unpack_files ?? []).filter((f) => f.url && (f.format ?? 'srt').toLowerCase() === 'srt')
      // Files inside a pack often carry season 0: only a stated, different season rules one out.
      const wanted =
        q.kind === 'episode' ? files.filter((f) => (!f.season || f.season === q.season) && f.episode === q.episode) : files.slice(0, 1)
      if (wanted.length) {
        for (const f of wanted) {
          hits.push({
            ...base(s),
            ref: stripKey(f.url!),
            release: (f.release_name || f.name || s.release_name || '').replace(/\.srt$/i, ''),
            language: (f.language ?? s.language ?? '?').toLowerCase(),
            hearingImpaired: !!f.hi,
          })
        }
        continue
      }
      // No unpacked list: the whole archive, with which episode to pick out of it.
      if (!s.url || s.full_season) continue
      const pick = q.kind === 'episode' ? `#s${q.season}e${q.episode}` : ''
      hits.push({
        ...base(s),
        ref: stripKey(s.url) + pick,
        release: s.release_name || s.name || '',
        language: (s.language ?? '?').toLowerCase(),
        hearingImpaired: !!s.hi,
      })
    }
    return sortHits(hits, this.cfg.languages)
  }

  /** `ref` is a download path from `search`; returns the SRT text. */
  async download(ref: string): Promise<string> {
    const [path, pick] = ref.split('#')
    const res = await fetch(requestUrl(`${DL}${path}`))
    if (!res.ok) throw new Error(`SubDL download: HTTP ${res.status}`)
    const buf = await res.arrayBuffer()
    if (!/\.zip$/i.test(path!)) return new TextDecoder('utf-8').decode(buf)
    const entries = listZip(buf).filter((e) => /\.srt$/i.test(e.name))
    if (!entries.length) throw new Error('SubDL archive holds no .srt file')
    let entry = entries[0]!
    if (pick) {
      const m = /^s(\d+)e(\d+)$/.exec(pick)
      const want = m ? new RegExp(`s0*${m[1]}e0*${m[2]}(?!\\d)`, 'i') : null
      const found = want && entries.find((e) => want.test(e.name))
      if (!found) throw new Error('SubDL archive has no file for this episode')
      entry = found
    }
    return new TextDecoder('utf-8').decode(await readZipEntry(buf, entry.name))
  }

  private async call(url: string): Promise<SdResponse> {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 20_000)
    try {
      const res = await fetch(requestUrl(url), {
        headers: { Accept: 'application/json', Authorization: `Bearer ${this.cfg.apiKey}` },
        signal: ctl.signal,
      })
      const text = await res.text()
      let body: SdResponse = {}
      try {
        body = JSON.parse(text) as SdResponse
      } catch {
        throw new Error(`SubDL: HTTP ${res.status}`)
      }
      const code = typeof body.error === 'object' ? body.error?.code : body.error
      const message = (typeof body.error === 'object' ? body.error?.message : undefined) || body.message
      if (res.status === 401 || res.status === 403 || code === 'unauthorized' || code === 'not_authorized') {
        throw new Error('SubDL rejected the API key')
      }
      if (res.status === 429 || code === 'quota_exceeded') throw new Error('SubDL search limit reached for today')
      if (!res.ok || body.status === false) throw new Error(`SubDL: ${message || code || `HTTP ${res.status}`}`)
      return body
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw new Error('SubDL timed out')
      throw err
    } finally {
      clearTimeout(timer)
    }
  }
}
