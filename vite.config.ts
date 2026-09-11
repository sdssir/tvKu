/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// Confirmed on the device: webOS 26 (SDK 11.2.0) runs Chromium 132.
const TARGET = 'chrome132'

/**
 * Dev-only CORS proxy. IPTV servers never send CORS headers; the TV does not
 * care (packaged webOS apps are exempt from same-origin policy) but a desktop
 * browser does. `src/services/http.ts` routes through `/__proxy?url=` in dev.
 */
function devProxy(): Plugin {
  return {
    name: 'tvku-dev-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__proxy', async (req, res) => {
        const target = new URL(req.url ?? '', 'http://x').searchParams.get('url')
        if (!target || !/^https?:\/\//.test(target)) {
          res.statusCode = 400
          res.end('missing url')
          return
        }
        try {
          const upstream = await fetch(target, { redirect: 'follow' })
          res.statusCode = upstream.status
          res.setHeader('content-type', upstream.headers.get('content-type') ?? 'application/octet-stream')
          res.end(Buffer.from(await upstream.arrayBuffer()))
        } catch (err) {
          res.statusCode = 502
          res.end(String(err))
        }
      })
    },
  }
}

export default defineConfig(({ command }) => ({
  // The packaged app loads from local files, so every emitted URL must be relative.
  base: './',
  plugins: [vue(), devProxy()],
  /*
   * webOS plays HLS natively; desktop Chrome does not. hls.js is loaded only
   * under `npm run dev` — with this false, Rollup drops the dynamic import and
   * the chunk never reaches the .ipk.
   */
  define: { __HLS_FALLBACK__: JSON.stringify(command === 'serve') },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: TARGET,
    cssTarget: TARGET,
    outDir: 'dist',
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 900,
  },
  server: { host: true, port: 5174 },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
  },
}))
