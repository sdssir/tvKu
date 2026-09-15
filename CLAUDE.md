# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

tvKu is an IPTV player (Xtream Codes panel or M3U playlist) packaged as an LG webOS web app for
an OLED48C6 running webOS 26 (Chromium 132). Vue 3 + Vite + TypeScript, `vue` is the only runtime
dependency. It is driven entirely by a TV remote: D-pad, OK, Back, colour keys, CH±. The README
covers features, provider quirks (EPG time zones, connection limits), and subtitle ranking; read it
before touching those areas.

## Commands

```bash
npm run dev          # Vite on :5174 with a CORS proxy (/__proxy?url=) for the IPTV server
npm run build        # vue-tsc --noEmit, then vite build → dist/ (relative base, chrome132 target)
npm run typecheck    # vue-tsc --noEmit
npm run test         # vitest run (happy-dom); tests live next to sources as src/**/*.test.ts
npx vitest run src/services/quality.test.ts   # single file
npx vitest run -t "prefers the same lane"     # single test by name

npm run webos:check / webos:package / webos:install / webos:launch / webos:deploy / webos:inspect
```

webOS scripts need `@webosose/ares-cli` on PATH and a device registered via `ares-setup-device`.
The install script hardcodes the .ipk filename, so the version in `package.json`,
`public/appinfo.json` and `src/config/app.ts` must be bumped together.

Desktop keys: arrows = D-pad, Enter = OK, Escape = Back. `localStorage.setItem('tvku:debug','1')`
on the TV turns on `[player]` logging.

## Architecture

State is module-scoped singletons wrapped in composables (`src/composables/use*.ts`). Calling
`useCatalog()` anywhere returns the same refs, so there is no store library and no prop drilling
for global state. `App.vue` is the only router: a `tab` ref picks the view, a `detail` ref opens
a VOD/series overlay, and `player.isOpen` swaps in `PlayerScreen`.

**Data flow.** `useAccount` holds credentials and builds an `XtreamApi` (or a parsed M3U
playlist). `useCatalog` fetches categories and lists per `ContentKind` (`live` | `vod` | `series`),
caches the live list in localStorage for six hours, keeps VOD/series in memory only, and exposes
`itemsIn(kind, categoryId)` which applies the tab's search and sort. `services/xtreamApi.ts`
normalises every panel response; nothing downstream reads raw panel JSON. All persistence goes
through `useLocalStorage` (`KEYS`, `useStoredRef`), prefixed `tvku:v1:` and tolerant of corrupt
values.

**The single `<video>` element (do not break this).** `usePlayer` creates one `<video>` inside a
fixed `#video-stage` div appended to `document.body` at module load, z-index 0, and never moves or
recreates it. webOS won't load a detached media element, restarts the pipeline if the element
moves in the DOM, and leaks pipelines if elements are created per stream. "Preview" vs
"fullscreen" is only the stage's rectangle: `LiveView` reports its preview box via
`setPreviewRect`, and the shell above the stage is `background: transparent` so the box is a
hole. Anything you place between the stage and the preview box must not paint a background.
Full screen sets the shell to `visibility: hidden` (not `v-if`), so Live TV keeps its state.
`hls.js` is only ever imported when `__HLS_FALLBACK__` is true (dev server); the build drops it.

**D-pad focus (`useTvNavigation`).** Focus is spatial, not DOM order. Any element with
`data-focus-id` is a candidate; a move picks the nearest visible one in that direction, preferring
the same scroll container. Large lists (`VirtualList`, `PosterGrid`) are a single focusable with
`data-focus-axis` and move an internal cursor; they receive a cancelable `focus-axis` CustomEvent
and call `preventDefault` to claim the move, otherwise focus leaves them. Rules that follow:
- OK triggers `.click()` on the focused element, so focusables must be clickable.
- After any DOM change that may remove the focused element, call `nav.reanchorFocus(fallbackId, /regex/)`. Focus must never vanish.
- Overlays register with `pushOverlay(id, close)` in `onMounted` and `popOverlay(id)` on close; Back closes the top overlay first, then `App.vue`'s `onBack` fallback, then exits the app.
- A full-screen surface takes every key via `setKeyInterceptor` (see `PlayerScreen.vue`); clear it on unmount.
- webOS key codes live in `KEY` (Back is 461, colour keys 403–406, CH± 427/428).

**Styling.** Everything is in rem; `html` is 16px at 1080p and scaled at 720p in `base.css`.
Design tokens are in `src/styles/tokens.css` (true-black ground for OLED, one gold accent used
only for active/focus). Fonts are bundled under `public/fonts`; never reference a font CDN.
Nothing below 15px at 1080p. The design reference is `assets/design.png`.

**Idle screensaver (`useIdle` / `IdleSaver`).** Fires after N minutes of no input unless
full-screen video is playing; a paused frame counts as static. The key that wakes it is swallowed.
