/**
 * fetch with a timeout, routed through the Vite dev proxy on desktop.
 *
 * On the TV the URL is used as-is: packaged webOS web apps are not subject to
 * CORS, and IPTV servers never send the headers a browser would need.
 */

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export function requestUrl(url: string): string {
  return import.meta.env.DEV ? `/__proxy?url=${encodeURIComponent(url)}` : url
}

export async function fetchText(url: string, timeoutMs = 20_000): Promise<string> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetch(requestUrl(url), { signal: ctl.signal, cache: 'no-store' })
    if (!res.ok) throw new HttpError(`HTTP ${res.status}`, res.status)
    return await res.text()
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new Error('Request timed out')
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchJson<T>(url: string, timeoutMs?: number): Promise<T> {
  const text = await fetchText(url, timeoutMs)
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error('Server returned something that is not JSON')
  }
}
