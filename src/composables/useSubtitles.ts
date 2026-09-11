import { computed, ref, shallowRef } from 'vue'
import { OpenSubtitles, type OsConfig, type SubtitleHit, type SubtitleQuery } from '@/services/opensubtitles'
import { cueAt, parseSrt, type Cue } from '@/services/srt'
import { KEYS, useStoredRef } from './useLocalStorage'
import { setSessionStartHook, usePlayer } from './usePlayer'
import { useAccount } from './useAccount'

/**
 * Subtitles for movies and episodes, fetched from OpenSubtitles and drawn by
 * the player screen itself (webOS exposes no in-band text tracks, and our own
 * overlay is styled for a TV across the room).
 *
 * A chosen file is kept per title so replaying does not spend another download
 * from the daily quota.
 */

interface Saved {
  fileId: number
  language: string
  release: string
  srt: string
}

const MAX_SAVED = 8

const settings = useStoredRef<OsConfig>(KEYS.subtitles, { apiKey: '', username: '', password: '', languages: 'en,ms' })
/** Saved choice per item id, most recent first. */
const saved = useStoredRef<Array<{ id: string } & Saved>>(KEYS.subtitleCache, [])

const cues = shallowRef<Cue[]>([])
const active = ref<{ language: string; release: string } | null>(null)
/** Manual sync adjustment in seconds; positive shows cues later. */
const offset = ref(0)
const remaining = ref<number | null>(null)

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

/** A VOD/episode session started (id) or any session ended (null): restore last choice. */
function restoreFor(id: string | null) {
  clear()
  if (!id) return
  const hit = saved.value.find((s) => s.id === id)
  if (!hit) return
  cues.value = parseSrt(hit.srt)
  active.value = { language: hit.language, release: hit.release }
}
setSessionStartHook(restoreFor)

let client: OpenSubtitles | null = null
let clientKey = ''
function api(): OpenSubtitles {
  const key = JSON.stringify(settings.value)
  if (!client || clientKey !== key) {
    client = new OpenSubtitles(settings.value)
    clientKey = key
    void client.login()
  }
  return client
}

export function useSubtitles() {
  const player = usePlayer()
  const configured = computed(() => settings.value.apiKey.trim().length > 0)

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
      error.value = 'Add an OpenSubtitles API key in Settings'
      return
    }
    searching.value = true
    try {
      results.value = await api().search(q)
      if (!results.value.length) error.value = 'No subtitles found for this title'
    } catch (err) {
      error.value = (err as Error).message
    } finally {
      searching.value = false
    }
  }

  async function choose(id: string, hit: SubtitleHit): Promise<boolean> {
    error.value = null
    try {
      const dl = await api().download(hit.fileId)
      const parsed = parseSrt(dl.srt)
      if (!parsed.length) throw new Error('That subtitle file is empty or unreadable')
      cues.value = parsed
      offset.value = 0
      active.value = { language: hit.language, release: hit.release }
      remaining.value = dl.remaining
      saved.value = [
        { id, fileId: hit.fileId, language: hit.language, release: hit.release, srt: dl.srt },
        ...saved.value.filter((s) => s.id !== id),
      ].slice(0, MAX_SAVED)
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
  }

  function nudge(seconds: number) {
    offset.value = Math.round((offset.value + seconds) * 10) / 10
  }

  /** Settings-screen check: a search that costs no download. */
  async function test(): Promise<string> {
    client = null
    const hits = await api().search({ kind: 'movie', title: 'Inception', year: '2010' })
    return `OK — ${hits.length} results for "Inception"`
  }

  return {
    settings,
    configured,
    currentText,
    active,
    offset,
    remaining,
    results,
    searching,
    error,
    currentQuery,
    search,
    choose,
    turnOff,
    nudge,
    test,
  }
}
