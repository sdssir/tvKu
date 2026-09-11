import { requestUrl } from './http'

/**
 * Size of a VOD file, from a one-byte ranged GET. The panel's hosts do not
 * answer HEAD, but they honour Range and report the total in Content-Range.
 * Size over duration is the average bitrate — the number that actually
 * explains why a "1080p" file looks soft.
 */
const cache = new Map<string, Promise<number | null>>()

export function probeSize(url: string): Promise<number | null> {
  let p = cache.get(url)
  if (!p) {
    p = (async () => {
      const ctl = new AbortController()
      const timer = setTimeout(() => ctl.abort(), 12_000)
      try {
        const res = await fetch(requestUrl(url), { headers: { Range: 'bytes=0-0' }, signal: ctl.signal })
        const cr = res.headers.get('content-range') // "bytes 0-0/1712345678"
        const total = cr ? Number(cr.split('/')[1]) : NaN
        if (Number.isFinite(total) && total > 0) return total
        const cl = Number(res.headers.get('content-length'))
        return res.status === 200 && Number.isFinite(cl) && cl > 1 ? cl : null
      } catch {
        return null
      } finally {
        clearTimeout(timer)
      }
    })()
    cache.set(url, p)
  }
  return p
}

export const fmtBytes = (b: number) => (b >= 1073741824 ? `${(b / 1073741824).toFixed(1)} GB` : `${Math.round(b / 1048576)} MB`)
export const fmtMbps = (bytes: number, seconds: number) => `${((bytes * 8) / seconds / 1e6).toFixed(1)} Mbps`

/** "01:46:53" → seconds, or null. */
export function parseDuration(text: string | null | undefined): number | null {
  const m = text?.trim().match(/^(\d+):(\d{2}):(\d{2})$/)
  if (!m) return null
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
}
