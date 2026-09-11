import { computed, ref, shallowRef } from 'vue'
import { XtreamApi } from '@/services/xtreamApi'
import { fetchText } from '@/services/http'
import { parseM3u, type M3uResult } from '@/services/m3uParser'
import type { AccountInfo, Credentials, Episode, LiveChannel, StreamFormat, VodItem } from '@/types/iptv'
import { KEYS, clearStorage, readStorage, removeStorage, useStoredRef, writeStorage } from './useLocalStorage'

/**
 * The signed-in source: either an Xtream Codes panel or a plain M3U playlist.
 *
 * Credentials are kept in localStorage in the clear, like every IPTV client
 * does — it is a personal TV, and the panel sends them in every URL anyway.
 */

const credentials = shallowRef<Credentials | null>(readStorage<Credentials | null>(KEYS.credentials, null))
const account = shallowRef<AccountInfo | null>(readStorage<AccountInfo | null>(KEYS.account, null))
const api = shallowRef<XtreamApi | null>(null)
/** The parsed playlist for M3U sources; catalogue reads from it instead of the API. */
const playlist = shallowRef<M3uResult | null>(null)
const streamFormat = useStoredRef<StreamFormat>(KEYS.streamFormat, 'm3u8')
const busy = ref(false)

function buildApi(c: Credentials | null): XtreamApi | null {
  return c?.type === 'xtream'
    ? new XtreamApi({ server: c.server, username: c.username, password: c.password })
    : null
}
api.value = buildApi(credentials.value)

export function useAccount() {
  const isSignedIn = computed(() => credentials.value !== null)
  const sourceType = computed(() => credentials.value?.type ?? null)

  /** Validate against the server, then persist. Throws with a user-facing message. */
  async function signIn(c: Credentials): Promise<void> {
    busy.value = true
    try {
      if (c.type === 'xtream') {
        const candidate = new XtreamApi({ server: c.server, username: c.username, password: c.password })
        const info = await candidate.login()
        api.value = candidate
        account.value = info
        playlist.value = null
        writeStorage(KEYS.account, info)
      } else {
        const text = await fetchText(c.url.trim(), 60_000)
        if (!/#EXTM3U|#EXTINF/i.test(text)) throw new Error('That URL is not an M3U playlist')
        const parsed = parseM3u(text)
        if (!parsed.live.length && !parsed.vod.length) throw new Error('The playlist has no channels')
        playlist.value = parsed
        api.value = null
        account.value = null
        removeStorage(KEYS.account)
      }
      credentials.value = c
      writeStorage(KEYS.credentials, c)
      removeStorage(KEYS.catalog)
    } finally {
      busy.value = false
    }
  }

  /** Re-download the M3U on launch; Xtream needs nothing, its lists are fetched by the catalogue. */
  async function ensurePlaylist(): Promise<void> {
    const c = credentials.value
    if (c?.type !== 'm3u' || playlist.value) return
    const text = await fetchText(c.url, 60_000)
    playlist.value = parseM3u(text)
  }

  async function refreshAccount(): Promise<void> {
    if (!api.value) return
    try {
      account.value = await api.value.login()
      writeStorage(KEYS.account, account.value)
    } catch {
      /* stale info is fine */
    }
  }

  function signOut(): void {
    credentials.value = null
    account.value = null
    api.value = null
    playlist.value = null
    clearStorage()
  }

  /* ── stream URLs ────────────────────────────────────────────────────── */

  function liveUrl(ch: LiveChannel): string | null {
    if (ch.url) return ch.url
    return api.value ? api.value.liveUrl(ch.streamId, streamFormat.value) : null
  }
  function vodUrl(v: VodItem): string | null {
    if (v.url) return v.url
    return api.value ? api.value.vodUrl(v.streamId, v.containerExtension) : null
  }
  function episodeUrl(e: Episode): string | null {
    if (e.url) return e.url
    return api.value ? api.value.episodeUrl(e.id, e.containerExtension) : null
  }

  return {
    credentials,
    account,
    api,
    playlist,
    streamFormat,
    busy,
    isSignedIn,
    sourceType,
    signIn,
    signOut,
    ensurePlaylist,
    refreshAccount,
    liveUrl,
    vodUrl,
    episodeUrl,
  }
}
