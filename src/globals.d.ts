/** Build-time constant from `define` in vite.config.ts: true only under `npm run dev`. */
declare const __HLS_FALLBACK__: boolean

/** The object webOS injects into every web app (formerly `PalmSystem`). */
interface Window {
  webOSSystem?: { platformBack?: () => void }
  PalmSystem?: { platformBack?: () => void }
}
