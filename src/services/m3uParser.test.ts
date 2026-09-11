import { describe, expect, it } from 'vitest'
import { parseM3u } from './m3uParser'

const SAMPLE = `#EXTM3U
#EXTINF:-1 tvg-id="tv1.my" tvg-name="TV1" tvg-logo="http://x/tv1.png" group-title="Malaysia",TV1 HD
http://host/live/u/p/1.m3u8
#EXTINF:-1 group-title="Malaysia",TV2
http://host/live/u/p/2.ts
#EXTINF:-1 tvg-logo="" group-title="Movies | Action",Die Hard (1988)
http://host/movie/u/p/99.mkv
#EXTINF:-1,No URL follows
#EXTINF:-1,Broken
not-a-url
`

describe('parseM3u', () => {
  it('splits live and vod entries and builds categories from group-title', () => {
    const r = parseM3u(SAMPLE)
    expect(r.live.map((c) => c.name)).toEqual(['TV1 HD', 'TV2'])
    expect(r.live[0]).toMatchObject({
      logo: 'http://x/tv1.png',
      epgChannelId: 'tv1.my',
      url: 'http://host/live/u/p/1.m3u8',
      num: 1,
    })
    expect(r.liveCategories).toEqual([{ id: 'm3u-live:Malaysia', name: 'Malaysia', kind: 'live' }])
    expect(r.vod).toHaveLength(1)
    expect(r.vod[0]).toMatchObject({ name: 'Die Hard (1988)', containerExtension: 'mkv' })
    expect(r.vodCategories[0]?.name).toBe('Movies | Action')
  })

  it('tolerates an empty playlist', () => {
    expect(parseM3u('')).toEqual({ live: [], vod: [], liveCategories: [], vodCategories: [] })
  })
})
