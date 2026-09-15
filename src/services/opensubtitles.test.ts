import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenSubtitles, QuotaError, cleanTitle, downloadAcross, normaliseConfig, qualityScore, type DownloadResult } from './opensubtitles'

describe('cleanTitle', () => {
  it('removes panel decorations so the search matches the film', () => {
    expect(cleanTitle('Hotel Transylvania: Transformania (2022) 4k')).toBe('Hotel Transylvania: Transformania')
    expect(cleanTitle('The Marksman (2021)[BM]')).toBe('The Marksman')
    expect(cleanTitle('Sweet Home(eng)')).toBe('Sweet Home')
    expect(cleanTitle('Its Ok its Love(my)')).toBe('Its Ok its Love')
  })
})

describe('qualityScore', () => {
  const base = {
    provider: 'opensubtitles' as const,
    ref: '1',
    language: 'en',
    release: 'r',
    downloads: 0,
    hearingImpaired: false,
    matched: 'm',
    ratings: 0,
    votes: 0,
    fromTrusted: false,
    hd: false,
    autoTranslated: false,
    uploader: '',
  }

  it('sinks machine translations below anything human', () => {
    const auto = qualityScore({ ...base, autoTranslated: true, downloads: 999_999, fromTrusted: true })
    const human = qualityScore({ ...base, downloads: 1 })
    expect(auto).toBeLessThan(human)
  })

  it('treats an unrated file as unrated, not as rated zero', () => {
    // Both unrated; the more downloaded one wins on popularity alone.
    expect(qualityScore({ ...base, downloads: 10_000 })).toBeGreaterThan(qualityScore({ ...base, downloads: 100 }))
    // A genuinely rated file beats an unrated one with the same downloads.
    expect(qualityScore({ ...base, downloads: 100, ratings: 9, votes: 10 })).toBeGreaterThan(
      qualityScore({ ...base, downloads: 100 }),
    )
  })

  it('weights a rating by how many people voted', () => {
    const oneVote = qualityScore({ ...base, ratings: 10, votes: 1 })
    const manyVotes = qualityScore({ ...base, ratings: 10, votes: 10 })
    expect(manyVotes).toBeGreaterThan(oneVote)
  })

  it('prefers a trusted uploader over a moderately more popular stranger', () => {
    expect(qualityScore({ ...base, fromTrusted: true, downloads: 14_507 })).toBeGreaterThan(
      qualityScore({ ...base, downloads: 28_103 }),
    )
  })

  it('puts a plain file ahead of the same file marked hearing-impaired', () => {
    expect(qualityScore({ ...base, downloads: 100 })).toBeGreaterThan(
      qualityScore({ ...base, downloads: 100, hearingImpaired: true }),
    )
  })
})

describe('normaliseConfig', () => {
  it('folds a pre-list username/password into logins', () => {
    const c = normaliseConfig({ apiKey: 'k', username: 'ann', password: 'pw', languages: 'en' })
    expect(c).toEqual({ apiKey: 'k', logins: [{ username: 'ann', password: 'pw' }], subdlKey: '', languages: 'en' })
  })

  it('fills in anything missing or corrupt', () => {
    expect(normaliseConfig(null)).toEqual({ apiKey: '', logins: [], subdlKey: '', languages: 'en,ms' })
    expect(normaliseConfig({ apiKey: 'k', logins: [null, { username: 'b' }] }).logins).toEqual([{ username: 'b', password: '' }])
  })
})

describe('downloadAcross', () => {
  const NOW = Date.parse('2026-09-14T10:00:00Z')
  const file = (remaining: number | null, resetAt: number | null = null): DownloadResult => ({ srt: '1', fileName: 'f.srt', remaining, resetAt })
  const okClient = (remaining: number | null, resetAt: number | null = null) => ({
    calls: 0,
    download: vi.fn(async () => file(remaining, resetAt)),
  })
  const fullClient = (resetAt: number | null) => ({
    download: vi.fn(async () => {
      throw new QuotaError('full', resetAt)
    }),
  })

  it('uses the first login while it has quota', async () => {
    const a = okClient(19)
    const b = okClient(20)
    const r = await downloadAcross([{ id: 'a', client: a }, { id: 'b', client: b }], {}, '7', NOW)
    expect(r.id).toBe('a')
    expect(b.download).not.toHaveBeenCalled()
    expect(r.spent).toEqual({})
  })

  it('moves to the next login when the first answers 406, and remembers it', async () => {
    const reset = NOW + 3_600_000
    const a = fullClient(reset)
    const b = okClient(20)
    const r = await downloadAcross([{ id: 'a', client: a }, { id: 'b', client: b }], {}, '7', NOW)
    expect(r.id).toBe('b')
    expect(r.spent).toEqual({ a: reset })
    // The next download skips the spent login without a request.
    a.download.mockClear()
    const r2 = await downloadAcross([{ id: 'a', client: a }, { id: 'b', client: b }], r.spent, '8', NOW + 1000)
    expect(a.download).not.toHaveBeenCalled()
    expect(r2.id).toBe('b')
  })

  it('marks a login spent when its last download comes back with none remaining', async () => {
    const reset = NOW + 60_000
    const r = await downloadAcross([{ id: 'a', client: okClient(0, reset) }], {}, '7', NOW)
    expect(r.id).toBe('a')
    expect(r.spent).toEqual({ a: reset })
  })

  it('assumes a day when the API gave no reset time', async () => {
    const r = await downloadAcross([{ id: 'a', client: fullClient(null) }, { id: 'b', client: okClient(1) }], {}, '7', NOW)
    expect(r.spent.a).toBe(NOW + 24 * 3_600_000)
  })

  it('forgets a login once its reset time has passed', async () => {
    const a = okClient(5)
    const r = await downloadAcross([{ id: 'a', client: a }], { a: NOW - 1 }, '7', NOW)
    expect(r.id).toBe('a')
    expect(r.spent).toEqual({})
  })

  it('reports the earliest reset when every login is out', async () => {
    const accounts = [
      { id: 'a', client: fullClient(NOW + 7_200_000) },
      { id: 'b', client: fullClient(NOW + 3_600_000) },
    ]
    const err = await downloadAcross(accounts, {}, '7', NOW).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(QuotaError)
    expect((err as QuotaError).resetAt).toBe(NOW + 3_600_000)
    expect((err as Error).message).toMatch(/all 2 OpenSubtitles logins/)
  })

  it('lets any other failure through untouched', async () => {
    const boom = {
      download: vi.fn(async () => {
        throw new Error('Subtitle file: HTTP 500')
      }),
    }
    await expect(downloadAcross([{ id: 'a', client: boom }, { id: 'b', client: okClient(1) }], {}, '7', NOW)).rejects.toThrow('HTTP 500')
  })
})

describe('OpenSubtitles client', () => {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  afterEach(() => vi.unstubAllGlobals())

  it('turns a 406 into a QuotaError carrying the reset time', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(406, { message: 'You have downloaded your allowed 20 subtitles for 24h', reset_time_utc: '2026-09-15T02:00:00.000Z' })),
    )
    const os = new OpenSubtitles({ apiKey: 'k', languages: 'en' }, { username: 'ann', password: 'pw' })
    const err = await os.download('1').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(QuotaError)
    expect((err as QuotaError).resetAt).toBe(Date.parse('2026-09-15T02:00:00.000Z'))
    expect((err as Error).message).toMatch(/for ann/)
  })

  it('logs in once before the first request and sends the token after', async () => {
    const seen: Array<{ url: string; auth: string | undefined }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (raw: string, init?: RequestInit) => {
        // The dev build routes through /__proxy?url=…; look at the real target.
        const url = decodeURIComponent(raw)
        const h = init?.headers as Record<string, string> | undefined
        seen.push({ url, auth: h?.Authorization })
        if (url.includes('/login')) return json(200, { token: 'T' })
        if (url.includes('/download')) return json(200, { link: 'https://x/f.srt', file_name: 'f.srt', remaining: 3, reset_time_utc: '2026-09-15T02:00:00.000Z' })
        return new Response('1\n00:00:01,000 --> 00:00:02,000\nhi\n', { status: 200 })
      }),
    )
    const os = new OpenSubtitles({ apiKey: 'k', languages: 'en' }, { username: 'ann', password: 'pw' })
    const r = await os.download('1')
    expect(r.remaining).toBe(3)
    expect(r.resetAt).toBe(Date.parse('2026-09-15T02:00:00.000Z'))
    expect(seen.map((s) => s.url.includes('/login'))).toEqual([true, false, false])
    expect(seen[1].auth).toBe('Bearer T')
    // A second call does not log in again.
    await os.download('2')
    expect(seen.filter((s) => s.url.includes('/login'))).toHaveLength(1)
  })
})
