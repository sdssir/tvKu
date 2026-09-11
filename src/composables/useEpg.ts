import { ref, shallowRef } from 'vue'
import type { EpgEntry, LiveChannel } from '@/types/iptv'
import { useAccount } from './useAccount'

/**
 * Now/next for one channel at a time, fetched lazily as the cursor moves.
 * A full XMLTV dump would be megabytes; the short EPG call is a few hundred
 * bytes and the panel answers it fast enough to feel instant.
 */
const cache = new Map<string, { at: number; entries: EpgEntry[] }>()
const TTL = 5 * 60 * 1000

export function useEpg() {
  const acct = useAccount()
  const entries = shallowRef<EpgEntry[]>([])
  const loading = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null
  let latest = ''

  function request(ch: LiveChannel | null, delayMs = 350) {
    if (timer) clearTimeout(timer)
    entries.value = []
    if (!ch || !acct.api.value) return
    const hit = cache.get(ch.streamId)
    if (hit && Date.now() - hit.at < TTL) {
      entries.value = hit.entries
      return
    }
    latest = ch.streamId
    timer = setTimeout(async () => {
      loading.value = true
      try {
        const got = await acct.api.value!.shortEpg(ch.streamId, 4)
        cache.set(ch.streamId, { at: Date.now(), entries: got })
        if (latest === ch.streamId) entries.value = got
      } catch {
        /* no EPG for this channel — the panel is silent about it */
      } finally {
        loading.value = false
      }
    }, delayMs)
  }

  return { entries, loading, request }
}

export const fmtTime = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/** 0–1 progress of the entry that is on air now, or null. */
export function progressOf(e: EpgEntry, now = Date.now()): number | null {
  if (now < e.start || now > e.end) return null
  return (now - e.start) / (e.end - e.start)
}
