# tvKu — IPTV player for LG webOS TV

An IPTV Smarters–style player for the LG **OLED48C6PSA** (webOS 26). Signs in to an
**Xtream Codes** panel (server + username + password) or loads an **M3U playlist URL**, then
browses Live TV, Movies and Series from the remote — no mouse required.

**Features**

- Live TV: category rail, channel list, now/next programme guide (Xtream `get_short_epg`), and a
  **preview panel** — OK on a channel plays it there with sound, OK again (or OK on the preview)
  goes full screen, Back returns to the preview. Full screen has ▲▼ / CH± zapping, an
  OK-to-open channel list and digit entry.
- Movies: poster grid, detail page (plot, cast, rating, duration), resume where you left off.
- Series: seasons and episodes, auto-plays the next episode, remembers position per episode.
- Movie detail pages and the player OSD show the file's **size and average bitrate** next to the
  decoded resolution — resolution alone flatters upscaled sources, and a 2 Mbps "1080p" file and a
  14 Mbps one look nothing alike.
- Every browsing tab has its own **search** and **sort** (Live: provider order · HD first · A–Z;
  Movies and Series: latest added · A–Z · top rated · provider order).
- Subtitles from OpenSubtitles, matched by TMDB id and ranked by quality (see below).
- Favourites and Recently watched; Settings with account status, stream format, subtitles.
- **OLED protection**: after a chosen idle time (default 3 min) on a static screen, a screensaver
  dims everything except a running preview and drifts a clock about. Full-screen playback never
  triggers it; a paused frame does. The key that wakes the screen is swallowed.

**Design.** Follows the reference in `assets/design.png`: a left navigation rail over the
Kuala Lumpur night plate (`assets/backgroud.png`, baked with its scrim into
`public/assets/bg.webp` so the DOM can stay transparent for the video preview hole), translucent
cards, one warm gold used for the active state and the focus ring, category glyphs guessed from
category names, and bundled Inter / Outfit type so the TV never waits on a font CDN. Nothing
below 15 px at 1080p.

## Tech stack

Vue 3 · Vite · TypeScript · HTML5 `<video>` (webOS plays HLS natively) · `fetch` ·
`localStorage`. The only runtime dependency is `vue`. `hls.js` is a dev dependency used **only**
under `npm run dev` so desktop Chrome can play HLS; the TV build never contains it.

## Development

```bash
npm install
npm run dev          # http://localhost:5174 — includes a CORS proxy for the IPTV server
npm run build        # type-check (vue-tsc) + production build to dist/
npm run typecheck
npm run test         # vitest
```

Keyboard on desktop: arrows = D-pad, Enter = OK, Escape = Back, Space = play/pause.

## webOS package / install

```bash
npm run webos:check     # build + ares-package --check
npm run webos:package   # build + .ipk into release/
npm run webos:install   # install on the default device
npm run webos:launch
npm run webos:deploy    # package + install + launch
npm run webos:inspect   # remote Chrome DevTools
```

Requires `@webosose/ares-cli` and a TV registered with `ares-setup-device` (Developer Mode on
the TV). The walkthrough in the sibling radio app's `docs/WEBOS_DEPLOY.md` applies unchanged;
only the app id (`com.jul.tvku`) differs.

## The single video element

webOS allows one media pipeline per app, will not start loading a `<video>` that is not in the
document, and restarts the pipeline if the element moves in the DOM. So `usePlayer` keeps one
`<video>` inside a fixed stage under the UI for the life of the app, and "preview" versus "full
screen" is only the stage's rectangle: the Live TV preview box is a transparent hole the stage
shows through (nothing between it and the stage may paint a background), and full screen is the
stage at `inset: 0` with the shell set to `visibility: hidden`. Switching modes never touches
`src`, so the stream is continuous.

## Notes on providers

- **Stream URLs** follow the Xtream convention: `/live/U/P/{id}.m3u8`, `/movie/U/P/{id}.{ext}`,
  `/series/U/P/{episodeId}.{ext}`. Live defaults to HLS; MPEG-TS can be chosen in Settings.
- **EPG times**: panels emit `start`/`end` as server-local strings and mis-zone the
  `*_timestamp` fields, so the strings are trusted (correct when the TV is in the provider's
  timezone, which is the normal case).
- **Big catalogues** (tens of thousands of movies) are fetched the first time the Movies or
  Series tab opens and kept in memory only; the Live list is cached in `localStorage` for six
  hours. Every list is virtualised — the DOM holds one screenful.
- **Connections**: the panel counts every open stream, including a desktop `npm run dev`
  session, against `max_connections`.
- **M3U sources** get Live and Movies (by URL shape); no EPG or series metadata.

## Subtitles

Movies and episodes pull subtitles from SubDL and/or OpenSubtitles; set either API key or both
in Settings, plus a language order, and the two lists are merged. *Test connection* checks each
key.

- **SubDL** (free key from the subdl.com account panel): 2,000 searches a day, and downloads are
  anonymous, counted per IP address (300 a day). Search asks for the unpacked file list so the
  raw `.srt` is fetched directly; an entry without one is downloaded as a ZIP and opened on the
  TV with the browser's DecompressionStream (`src/services/zip.ts`).
- **OpenSubtitles** (free key from opensubtitles.com/consumers): 20 downloads a day per account
  login. The limit is counted per account (per IP address without one), not per API key, so
  Settings takes a list of logins: a download goes to the first account with quota left, and one
  that runs out is skipped until the reset time the API reports.

While playing: **▼** opens the list and the chosen file is cached per title so a replay costs no
download.

**Out of sync?** Press **yellow** (or pick *Adjust timing* in the list). The panel lists the lines
around the current moment and keeps its cursor on the one about to be spoken; move to the line
you are actually hearing and press **OK**, and the whole file shifts so that line starts now.
**◀ ▶** nudge by 0.5 s, **⏪ ⏩** by 5 s, **blue** resets; **red / green** still nudge by 0.5 s
outside the panel. The correction is remembered per title.

**Matching is by TMDB id, not title.** The panel supplies `tmdb_id` for movies (via
`get_vod_info`) and for episodes (inside `get_series_info`), and OpenSubtitles accepts it
directly, as does SubDL. This matters more than it sounds: a title search for *The Wolf and the
Lion* returns 3,426 rows — mostly *Shang-Chi*, *Raya and the Last Dragon* and *The Witcher:
Nightmare of the Wolf*, because the words "the", "and", "wolf" and "lion" match everything —
while the id returns exactly the 5 files for that film. Title search remains the fallback when a
panel gives no id.

Within each language, files are ordered by `qualityScore`. SubDL reports none of these signals,
so its files score 0 and sit below any rated or popular OpenSubtitles file in the same language,
in the order SubDL returned them:

| Signal | Weight | Why |
|---|---|---|
| AI / machine translated | −10 | reads badly; effectively disqualifying |
| Trusted uploader | +3 | outweighs raw popularity |
| Community rating | up to +3 | only when someone voted, scaled by vote count |
| Download count | +log₁₀(n) | the crowd's verdict, so 300k beats 30k without burying the rest |
| HD | +0.5 | usually the better-timed release |
| Hearing-impaired | −0.5 | sound descriptions most viewers do not want; stays selectable |

An unrated file reports `ratings: 0.0` from the API, which must not be read as "rated zero" —
the rating term applies only when `votes > 0`.

## Debugging on the TV

```js
localStorage.setItem('tvku:debug', '1')   // verbose [player] logs, then relaunch
```

Credentials are stored in the TV's `localStorage` in the clear, as every IPTV client does; sign
out from Settings to wipe everything the app stored.
