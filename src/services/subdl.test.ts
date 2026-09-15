import { afterEach, describe, expect, it, vi } from 'vitest'
import { SubDL, maskKey } from './subdl'

/* Shapes copied from real responses (keys redacted). */
const KEY = 'subdl_TEST'
const movieBody = {
  status: true,
  results: [{ sd_id: 2922, type: 'movie', name: 'Inception', tmdb_id: 27205, year: 2010 }],
  subtitles: [
    {
      release_name: 'Inception.2010.Bluray.1080p.DTS-HD.x264-Grym',
      name: 'SUBDL::inception-2714566.zip',
      author: 'TheFlamboyant',
      url: `/subtitle/2812133-2714566.zip?api_key=${KEY}`,
      season: 0,
      episode: null,
      language: 'EN',
      hi: true,
      full_season: false,
      unpack_files: [
        {
          file_n_id: 'A6VUchBqb1',
          name: 'Inception.2010.Bluray.1080p.DTS-HD.x264-Grym..eng.srt',
          release_name: 'Inception.2010.Bluray.1080p.DTS-HD.x264-Grym..eng',
          season: 0,
          episode: 0,
          language: 'EN',
          hi: false,
          format: 'srt',
          url: `/subtitle/Jua48o9EdW/A6VUchBqb1?api_key=${KEY}`,
        },
      ],
    },
    // No unpacked list: falls back to the archive.
    { release_name: 'Inception.DVDRiP.XviD-ARROW', author: 'cgha', url: `/subtitle/97670-378551.zip?api_key=${KEY}`, language: 'MS', hi: false, full_season: false },
  ],
}
const episodeBody = {
  status: true,
  results: [{ name: 'Breaking Bad', tmdb_id: 1396, year: 2008 }],
  subtitles: [
    {
      release_name: 'Breaking.Bad.S01.720p.WEB-DL.DD5.1.AVC-CtrlHD',
      author: 'TrAnCeRx',
      url: `/subtitle/1-2.zip?api_key=${KEY}`,
      season: 1,
      episode: null,
      language: 'EN',
      hi: true,
      full_season: true,
      unpack_files: [
        { name: 'Breaking Bad S01E01 Pilot.srt', release_name: 'Breaking Bad S01E01 Pilot', season: 1, episode: 1, language: 'EN', hi: false, format: 'srt', url: `/subtitle/izPhzEJ5zp/8dlftoPX5e?api_key=${KEY}` },
        { name: 'Breaking Bad S01E02 Cat.srt', release_name: 'Breaking Bad S01E02 Cat', season: 0, episode: 2, language: 'EN', hi: false, format: 'srt', url: `/subtitle/izPhzEJ5zp/UrNza33Gzg?api_key=${KEY}` },
      ],
    },
    // A full-season archive with no file list cannot be picked apart by episode: skipped.
    { release_name: 'Breaking.Bad.S01.FLAWL3SS', url: `/subtitle/3-4.zip?api_key=${KEY}`, season: 1, episode: null, language: 'EN', full_season: true },
  ],
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const target = (raw: string) => decodeURIComponent(raw).replace(/^.*\?url=/, '')
const auth = (init?: RequestInit) => (init?.headers as Record<string, string> | undefined)?.Authorization

describe('SubDL', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('searches by TMDB id, prefers raw files, strips the key from refs, and keeps language order', async () => {
    const urls: string[] = []
    const auths: Array<string | undefined> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (raw: string, init?: RequestInit) => {
        urls.push(target(raw))
        auths.push(auth(init))
        return json(movieBody)
      }),
    )
    const hits = await new SubDL({ apiKey: KEY, languages: 'ms,en' }).search({ kind: 'movie', title: 'Inception (2010)', year: '2010', tmdbId: '27205' })
    const q = new URL(urls[0]!).searchParams
    expect(urls[0]).toMatch(/^https:\/\/api\.subdl\.com\/api\/v2\/subtitles\/search\?/)
    expect(auths[0]).toBe(`Bearer ${KEY}`)
    expect(q.get('api_key')).toBeNull()
    expect(q.get('type')).toBe('movie')
    expect(q.get('tmdb_id')).toBe('27205')
    expect(q.get('film_name')).toBeNull()
    expect(q.get('languages')).toBe('MS,EN')
    expect(q.get('unpack')).toBe('1')
    expect(hits.map((h) => [h.provider, h.language, h.ref, h.hearingImpaired])).toEqual([
      ['subdl', 'ms', '/subtitle/97670-378551.zip', false],
      ['subdl', 'en', '/subtitle/Jua48o9EdW/A6VUchBqb1', false],
    ])
    expect(hits[1]!.release).toBe('Inception.2010.Bluray.1080p.DTS-HD.x264-Grym..eng')
    expect(hits[1]!.matched).toBe('Inception 2010')
    expect(hits[1]!.uploader).toBe('TheFlamboyant')
    expect(JSON.stringify(hits)).not.toContain(KEY)
  })

  it('falls back to a cleaned title and year without an id', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (raw: string) => (urls.push(target(raw)), json({ status: true, results: [], subtitles: [] }))))
    await new SubDL({ apiKey: KEY, languages: 'en' }).search({ kind: 'movie', title: 'The Marksman (2021)[BM]', year: '2021' })
    const q = new URL(urls[0]!).searchParams
    expect(q.get('film_name')).toBe('The Marksman')
    expect(q.get('year')).toBe('2021')
    expect(q.get('type')).toBe('movie')
  })

  it('picks the one episode out of a season pack and skips packs it cannot open', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (raw: string) => (urls.push(target(raw)), json(episodeBody))))
    const hits = await new SubDL({ apiKey: KEY, languages: 'en' }).search({ kind: 'episode', title: 'Breaking Bad', season: 1, episode: 2, tmdbId: '1396' })
    const q = new URL(urls[0]!).searchParams
    expect(q.get('type')).toBe('tv')
    expect(q.get('season')).toBe('1')
    expect(q.get('episode')).toBe('2')
    expect(hits.map((h) => [h.ref, h.release])).toEqual([['/subtitle/izPhzEJ5zp/UrNza33Gzg', 'Breaking Bad S01E02 Cat']])
  })

  it('downloads a raw file as text without sending the key (anonymous per-IP quota)', async () => {
    const urls: string[] = []
    const auths: Array<string | undefined> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (raw: string, init?: RequestInit) => {
        urls.push(target(raw))
        auths.push(auth(init))
        return new Response('\ufeff1\n00:00:01,000 --> 00:00:02,000\nhi\n')
      }),
    )
    const srt = await new SubDL({ apiKey: KEY, languages: 'en' }).download('/subtitle/Jua48o9EdW/A6VUchBqb1')
    expect(urls[0]).toBe('https://dl.subdl.com/subtitle/Jua48o9EdW/A6VUchBqb1')
    expect(auths[0]).toBeUndefined()
    expect(srt).toContain('00:00:01,000 --> 00:00:02,000')
  })

  it('names a bad key, a search limit and other v2 errors clearly', async () => {
    const v2err = (code: string, message: string, status: number) =>
      json({ error: { code, message, docs_url: 'https://subdl.com/developers#errors' } }, status)
    const search = (key: string) => new SubDL({ apiKey: key, languages: 'en' }).search({ kind: 'movie', title: 'x', year: null })
    vi.stubGlobal('fetch', vi.fn(async () => v2err('unauthorized', 'Not Authorized', 401)))
    await expect(search('nope')).rejects.toThrow('SubDL rejected the API key')
    vi.stubGlobal('fetch', vi.fn(async () => v2err('quota_exceeded', 'Daily request quota exceeded.', 429)))
    await expect(search(KEY)).rejects.toThrow('SubDL search limit')
    vi.stubGlobal('fetch', vi.fn(async () => v2err('invalid_request', 'When searching by tmdb_id you must also pass type', 400)))
    await expect(search(KEY)).rejects.toThrow('SubDL: When searching by tmdb_id')
    // The v1 shape, in case a path still answers with it.
    vi.stubGlobal('fetch', vi.fn(async () => json({ status: false, statusCode: 403, error: 'not_authorized', message: 'Not Authorized' }, 403)))
    await expect(search('nope')).rejects.toThrow('SubDL rejected the API key')
  })
})

describe('SubDL account', () => {
  afterEach(() => vi.unstubAllGlobals())

  const meBody = {
    user: { id: 268965, name: 'Jul', username: null },
    plan: { is_pro: false, name: 'Free' },
    usage: {
      search: { used: 12, limit: 2000, remaining: 1988, period: 'day', reset_at: '2026-09-16T00:00:00.000Z' },
      downloads: { used: 3, limit: 50, remaining: 47, period: 'day', reset_at: '2026-09-16T00:00:00.000Z' },
    },
  }

  it('verifies the key against /me and reads both daily counters', async () => {
    const urls: string[] = []
    const auths: Array<string | undefined> = []
    vi.stubGlobal('fetch', vi.fn(async (raw: string, init?: RequestInit) => (urls.push(target(raw)), auths.push(auth(init)), json(meBody))))
    const a = await new SubDL({ apiKey: KEY, languages: 'en' }).account()
    expect(urls[0]).toBe('https://api.subdl.com/api/v2/me')
    expect(auths[0]).toBe(`Bearer ${KEY}`)
    expect(a.name).toBe('Jul')
    expect(a.plan).toBe('Free')
    expect(a.isPro).toBe(false)
    expect(a.downloads).toEqual({ used: 3, limit: 50, remaining: 47, resetAt: Date.parse('2026-09-16T00:00:00.000Z') })
    expect(a.searches.remaining).toBe(1988)
  })

  it('reports a rejected key', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ error: { code: 'unauthorized', message: 'Missing API key.', docs_url: 'https://subdl.com/developers#errors' } }, 401)),
    )
    await expect(new SubDL({ apiKey: 'bad', languages: 'en' }).account()).rejects.toThrow('SubDL rejected the API key')
  })

  it('masks a key for display', () => {
    expect(maskKey('subdl_E1bH-_v6A3osq2Fh1KZ0aiUgB-aoZAzdrawnpzblltg')).toBe('subdl_E1bH…lltg')
    expect(maskKey('')).toBe('')
    expect(maskKey('short')).toBe('••••')
  })
})
