import { computed, ref, shallowRef } from 'vue'
import {
  OpenSubtitles,
  downloadAcross,
  normaliseConfig,
  sortHits,
  type OsConfig,
  type OsLogin,
  type SubtitleHit,
  type SubtitleQuery,
} from '@/services/opensubtitles'
import { SubDL } from '@/services/subdl'
import { cueAt, parseSrt, type Cue } from '@/services/srt'
import { KEYS, useStoredRef } from './useLocalStorage'
import { setSessionStartHook, usePlayer } from './usePlayer'
import { useAccount } from './useAccount'

/**
 * Subtitles for movies and episodes, fetched from OpenSubtitles and/or SubDL
 * (whichever has a key) and drawn by the player screen itself (webOS exposes
 * no in-band text tracks, and our own overlay is styled for a TV across the
 * room). Both providers are searched together and the lists merged.
 *
 * A chosen file is kept per title so replaying does not spend another download
 * from a daily quota. OpenSubtitles counts downloads per account, so Settings
 * takes a list of logins: a download goes to the first one with quota left,
 * and an account that runs out is remembered (with the reset time the API
 * gives) so the next download skips straight to the following login. SubDL
 * downloads are anonymous and need none of that.
 */

interface Saved {
  language: string
  release: string
  srt: string
}

const MAX_SAVED = 8

const settings = useStoredRef<OsConfig>(KEYS.subtitles, { apiKey: '', logins: [], subdlKey: '', languages: 'en,ms' })
settings.value = normaliseConfig(settings.value)
/** Login id → when its quota resets (epoch ms); an anonymous session is ''. */
const spent = useStoredRef<Record<string, number>>(KEYS.subtitleQuota, {})
/** Saved choice per item id, most recent first. */
const saved = useStoredRef<Array<{ id: string } & Saved>>(KEYS.subtitleCache, [])
/**
 * Timing correction per item id, seconds. Kept apart from the SRT cache so a
 * nudge does not rewrite megabytes of subtitle text on every key press.
 */
const offsets = useStoredRef<Record<string, number>>(KEYS.subtitleOffsets, {})
/** Item the current cues belong to; where a timing change is remembered. */
let currentId: string | null = null

const cues = shallowRef<Cue[]>([])
const active = ref<{ language: string; release: string } | null>(null)
/** Manual sync adjustment in seconds; positive shows cues later. */
const offset = ref(0)
const remaining = ref<number | null>(null)
/** Username the last download was charged to; empty when anonymous. */
const lastUser = ref('')

const results = shallowRef<SubtitleHit[]>([])
const searching = ref(false)
const error = ref<string | null>(null)

function clear() {
  cues.value = []
  active.value = null
  offset.value = 0
  results.value = []
  error.value = null
}

/** A VOD/episode session started (id) or any session ended (null): restore last choice and timing. */
function restoreFor(id: string | null) {
  clear()
  currentId = id
  if (!id) return
  const hit = saved.value.find((s) => s.id === id)
  if (!hit) return
  cues.value = parseSrt(hit.srt)
  active.value = { language: hit.language, release: hit.release }
  offset.value = offsets.value[id] ?? 0
}

function rememberOffset(id: string, seconds: number) {
  const next = { ...offsets.value }
  if (seconds) next[id] = seconds
  else delete next[id]
  // Only titles that still have a cached file need an offset.
  for (const k of Object.keys(next)) if (!saved.value.some((s) => s.id === k)) delete next[k]
  offsets.value = next
}
setSessionStartHook(restoreFor)

function loginId(l: OsLogin | null): string {
  return l ? l.username.trim().toLowerCase() : ''
}

/** Logins with both fields filled, in order; none means one anonymous slot. */
function usableLogins(): Array<OsLogin | null> {
  const list = settings.value.logins.filter((l) => l.username.trim() && l.password)
  return list.length ? list : [null]
}

/** Reset time still ahead for this login, or null when it can download. */
function spentUntil(l: OsLogin | null): number | null {
  const at = spent.value[loginId(l)]
  return at !== undefined && at > Date.now() ? at : null
}

/*
 * One client per login so each keeps its own bearer token. The set is
 * dropped when the key or languages change, since both live in the client.
 */
const clients = new Map<string, OpenSubtitles>()
let clientsFor = ''
function clientFor(l: OsLogin | null): OpenSubtitles {
  const base = JSON.stringify([settings.value.apiKey, settings.value.languages])
  if (clientsFor !== base) {
    clients.clear()
    clientsFor = base
  }
  const key = JSON.stringify(l)
  let c = clients.get(key)
  if (!c) {
    c = new OpenSubtitles(settings.value, l)
    clients.set(key, c)
    void c.login()
  }
  return c
}

/** Any login will do for a search (it costs no quota); prefer one that can also download. */
function api(): OpenSubtitles {
  const order = usableLogins()
  return clientFor(order.find((l) => !spentUntil(l)) ?? order[0])
}

let subdl: SubDL | null = null
let subdlFor = ''
function subdlApi(): SubDL {
  const key = JSON.stringify([settings.value.subdlKey, settings.value.languages])
  if (!subdl || subdlFor !== key) {
    subdl = new SubDL({ apiKey: settings.value.subdlKey, languages: settings.value.languages })
    subdlFor = key
  }
  return subdl
}

export function useSubtitles() {
  const player = usePlayer()
  const osConfigured = computed(() => settings.value.apiKey.trim().length > 0)
  const subdlConfigured = computed(() => settings.value.subdlKey.trim().length > 0)
  const configured = computed(() => osConfigured.value || subdlConfigured.value)

  const currentText = computed(() => {
    if (!cues.value.length) return ''
    return cueAt(cues.value, player.currentTime.value - offset.value)?.text ?? ''
  })


  /**
   * Build the query for whatever is playing. The panel's TMDB id is what makes
   * the result the right film, so it is worth one extra `get_vod_info` call
   * when the id is not already to hand.
   */
  async function currentQuery(): Promise<SubtitleQuery | null> {
    const s = player.session.value
    if (!s || s.kind === 'live') return null
    if (s.kind === 'episode') {
      return {
        kind: 'episode',
        title: s.series.name,
        season: s.episode.seasonNumber,
        episode: s.episode.episodeNumber,
        tmdbId: s.episode.tmdbId,
      }
    }
    let tmdbId: string | null = null
    const acct = useAccount()
    if (acct.api.value && !s.item.url) {
      try {
        tmdbId = (await acct.api.value.vodInfo(s.item.streamId)).tmdbId
      } catch {
        // No id: the title search still works, just less precisely.
      }
    }
    return { kind: 'movie', title: s.item.name, year: s.item.year, tmdbId }
  }

  async function search(q: SubtitleQuery): Promise<void> {
    error.value = null
    results.value = []
    if (!configured.value) {
      error.value = 'Add a SubDL or OpenSubtitles API key in Settings'
      return
    }
    searching.value = true
    try {
      // Both providers at once; one failing must not hide the other's list.
      const tasks: Array<Promise<SubtitleHit[]>> = []
      if (subdlConfigured.value) tasks.push(subdlApi().search(q))
      if (osConfigured.value) tasks.push(api().search(q))
      const settled = await Promise.allSettled(tasks)
      const hits = settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
      const failures = settled.flatMap((r) => (r.status === 'rejected' ? [(r.reason as Error).message] : []))
      results.value = sortHits(hits, settings.value.languages)
      if (!hits.length) error.value = failures.length ? failures.join(' · ') : 'No subtitles found for this title'
    } finally {
      searching.value = false
    }
  }

  async function choose(id: string, hit: SubtitleHit): Promise<boolean> {
    error.value = null
    try {
      let srt: string
      if (hit.provider === 'subdl') {
        srt = await subdlApi().download(hit.ref)
        remaining.value = null
        lastUser.value = ''
      } else {
        const accounts = usableLogins().map((l) => ({ id: loginId(l), client: clientFor(l) }))
        const { result: dl, id: chargedTo, spent: next } = await downloadAcross(accounts, spent.value, hit.ref)
        spent.value = next
        lastUser.value = accounts.find((a) => a.id === chargedTo)?.client.username ?? ''
        remaining.value = dl.remaining
        srt = dl.srt
      }
      const parsed = parseSrt(srt)
      if (!parsed.length) throw new Error('That subtitle file is empty or unreadable')
      cues.value = parsed
      offset.value = 0
      active.value = { language: hit.language, release: hit.release }
      saved.value = [
        { id, language: hit.language, release: hit.release, srt },
        ...saved.value.filter((s) => s.id !== id),
      ].slice(0, MAX_SAVED)
      rememberOffset(id, 0)
      return true
    } catch (err) {
      error.value = (err as Error).message
      return false
    }
  }

  function turnOff(id: string) {
    cues.value = []
    active.value = null
    offset.value = 0
    saved.value = saved.value.filter((s) => s.id !== id)
    rememberOffset(id, 0)
  }

  /**
   * Timing. `offset` is how much later the subtitles show than the file says:
   * positive when the file runs ahead of the picture. It is remembered per
   * title, so a corrected film stays corrected on the next play.
   */
  function setOffset(seconds: number) {
    offset.value = Math.round(seconds * 10) / 10
    if (currentId) rememberOffset(currentId, offset.value)
  }

  function nudge(seconds: number) {
    setOffset(offset.value + seconds)
  }

  /** The viewer is hearing `cue` right now: shift everything so it starts now. */
  function alignCue(cue: Cue) {
    setOffset(player.currentTime.value - cue.start)
  }

  /** Settings-screen check: a search on each provider (no download), then each OpenSubtitles password. */
  async function test(): Promise<string> {
    const probe = { kind: 'movie' as const, title: 'Inception', year: '2010', tmdbId: '27205' }
    const parts: string[] = []
    if (subdlConfigured.value) {
      subdl = null
      try {
        parts.push(`SubDL OK — ${(await subdlApi().search(probe)).length} results for "Inception"`)
      } catch (err) {
        parts.push((err as Error).message)
      }
    }
    if (osConfigured.value) {
      clients.clear()
      clientsFor = ''
      const logins = usableLogins()
      try {
        parts.push(`OpenSubtitles OK — ${(await clientFor(logins[0]).search(probe)).length} results`)
        const ok: string[] = []
        const bad: string[] = []
        for (const l of logins) {
          if (!l) continue
          ;(await clientFor(l).login()) ? ok.push(l.username.trim()) : bad.push(l.username.trim())
        }
        if (ok.length) parts.push(`logged in: ${ok.join(', ')}`)
        if (bad.length) parts.push(`login failed: ${bad.join(', ')}`)
      } catch (err) {
        parts.push((err as Error).message)
      }
    }
    return parts.join(' · ')
  }

  function addLogin() {
    settings.value.logins.push({ username: '', password: '' })
  }

  function removeLogin(index: number) {
    settings.value.logins.splice(index, 1)
  }

  return {
    settings,
    configured,
    osConfigured,
    subdlConfigured,
    cues,
    currentText,
    active,
    offset,
    remaining,
    lastUser,
    spentUntil,
    addLogin,
    removeLogin,
    results,
    searching,
    error,
    currentQuery,
    search,
    choose,
    turnOff,
    nudge,
    setOffset,
    alignCue,
    test,
  }
}
