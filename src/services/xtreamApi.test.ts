import { describe, expect, it, vi } from 'vitest'
import { XtreamApi, decodeBase64, normalizeServer } from './xtreamApi'

describe('normalizeServer', () => {
  it('reduces anything pasted to scheme://host:port', () => {
    expect(normalizeServer('example.com:8080')).toBe('http://example.com:8080')
    expect(normalizeServer('http://example.com:8080/')).toBe('http://example.com:8080')
    expect(normalizeServer('https://example.com/player_api.php?x=1')).toBe('https://example.com')
    expect(normalizeServer('  http://1.2.3.4:25461/get.php?username=a ')).toBe('http://1.2.3.4:25461')
  })
  it('rejects empty input', () => {
    expect(() => normalizeServer('  ')).toThrow()
  })
})

describe('XtreamApi urls', () => {
  const api = new XtreamApi({ server: 'host:8080', username: 'u', password: 'p' })
  it('builds stream urls the way the panel expects', () => {
    expect(api.liveUrl('12', 'm3u8')).toBe('http://host:8080/live/u/p/12.m3u8')
    expect(api.liveUrl('12', 'ts')).toBe('http://host:8080/live/u/p/12.ts')
    expect(api.vodUrl('7', 'mkv')).toBe('http://host:8080/movie/u/p/7.mkv')
    expect(api.vodUrl('7', '')).toBe('http://host:8080/movie/u/p/7.mp4')
    expect(api.episodeUrl('55', 'mp4')).toBe('http://host:8080/series/u/p/55.mp4')
  })
})

describe('decodeBase64', () => {
  it('decodes utf-8 payloads and passes junk through', () => {
    expect(decodeBase64(btoa('Berita'))).toBe('Berita')
    expect(decodeBase64('not base64!')).toBe('not base64!')
  })
})

describe('yearInName', () => {
  it('reads the year a panel hides in the title', async () => {
    const { XtreamApi } = await import('./xtreamApi')
    // Exercise through the public normaliser by faking fetch.
    const api = new XtreamApi({ server: 'h', username: 'u', password: 'p' })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([{ stream_id: 1, name: 'The Marksman (2021)[BM]', category_id: '9' }])),
    )
    const [v] = await api.vodStreams()
    expect(v?.year).toBe('2021')
    fetchMock.mockRestore()
  })
})

describe('epg times', () => {
  it('trusts the local-time string over the mis-zoned timestamp', async () => {
    const { XtreamApi } = await import('./xtreamApi')
    const api = new XtreamApi({ server: 'h', username: 'u', password: 'p' })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          epg_listings: [
            { title: btoa('News'), description: '', start: '2026-09-12 00:00:00', end: '2026-09-12 00:30:00', start_timestamp: '1789171200', stop_timestamp: '1789173000' },
          ],
        }),
      ),
    )
    const [e] = await api.shortEpg('1')
    expect(e?.start).toBe(new Date('2026-09-12T00:00:00').getTime())
    expect(e?.end - e!.start).toBe(30 * 60 * 1000)
    fetchMock.mockRestore()
  })
})
