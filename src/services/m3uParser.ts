import type { Category, LiveChannel, VodItem } from '@/types/iptv'

/**
 * Extended M3U (`#EXTINF:-1 tvg-logo="…" group-title="…",Name` + URL).
 *
 * Group titles become categories. Entries whose URL looks like an Xtream
 * movie/series path are surfaced under Movies; everything else is Live.
 */

export interface M3uResult {
  live: LiveChannel[]
  vod: VodItem[]
  liveCategories: Category[]
  vodCategories: Category[]
}

const ATTR_RE = /([A-Za-z0-9_-]+)="([^"]*)"/g

export function parseM3u(text: string): M3uResult {
  const lines = text.split(/\r?\n/)
  const live: LiveChannel[] = []
  const vod: VodItem[] = []
  const liveCats = new Map<string, Category>()
  const vodCats = new Map<string, Category>()

  let pending: { name: string; attrs: Record<string, string> } | null = null
  let n = 0

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('#EXTINF')) {
      const comma = line.lastIndexOf(',')
      const head = comma >= 0 ? line.slice(0, comma) : line
      const name = comma >= 0 ? line.slice(comma + 1).trim() : ''
      const attrs: Record<string, string> = {}
      for (const m of head.matchAll(ATTR_RE)) attrs[m[1]!.toLowerCase()] = m[2]!
      pending = { name: name || attrs['tvg-name'] || 'Untitled', attrs }
      continue
    }
    if (line.startsWith('#')) continue
    if (!pending) continue
    if (!/^https?:\/\//i.test(line)) {
      pending = null
      continue
    }

    n++
    const group = (pending.attrs['group-title'] || 'Uncategorised').trim()
    const logo = pending.attrs['tvg-logo'] || null
    const isVod = /\/(movie|series)\//i.test(line) || /\.(mp4|mkv|avi|mov)(\?|$)/i.test(line)

    if (isVod) {
      const id = `m3u-vod:${n}`
      const catId = `m3u-vod:${group}`
      if (!vodCats.has(catId)) vodCats.set(catId, { id: catId, name: group, kind: 'vod' })
      vod.push({
        kind: 'vod',
        id,
        name: pending.name,
        poster: logo,
        categoryId: catId,
        rating: null,
        year: null,
        streamId: id,
        containerExtension: line.match(/\.(\w{2,4})(\?|$)/)?.[1] ?? 'mp4',
        added: null,
        url: line,
      })
    } else {
      const id = `m3u-live:${n}`
      const catId = `m3u-live:${group}`
      if (!liveCats.has(catId)) liveCats.set(catId, { id: catId, name: group, kind: 'live' })
      live.push({
        kind: 'live',
        id,
        num: live.length + 1,
        name: pending.name,
        logo,
        categoryId: catId,
        epgChannelId: pending.attrs['tvg-id'] || null,
        streamId: id,
        url: line,
      })
    }
    pending = null
  }

  return {
    live,
    vod,
    liveCategories: [...liveCats.values()],
    vodCategories: [...vodCats.values()],
  }
}
