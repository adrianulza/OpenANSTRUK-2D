import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/postcss'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'root-redirect',
      configureServer(server) {
        // ⚠ Keep this table in lockstep with public/_redirects. This one only
        // serves `npm run dev`; _redirects is what the deployed Worker reads.
        // A path added to one and not the other works locally and 404s live,
        // or the reverse — and the reverse is the one nobody notices.
        //
        // `/app` is the original URL and is linked from published Instagram
        // posts — it stays, permanently. `/2d` is the canonical path alongside it.
        const PAGES: Record<string, string> = {
          '/': '/html/index.html',
          '/app': '/html/app.html',
          '/2d': '/html/app.html',
          '/donation': '/html/donation.html',
        }
        server.middlewares.use((req, _res, next) => {
          const url = req.url ?? ''
          const key = url.length > 1 && url.endsWith('/') ? url.slice(0, -1) : url
          if (PAGES[key]) req.url = PAGES[key]
          next()
        })
      },
    },
  ],
  css: {
    postcss: {
      plugins: [tailwindcss()],
    },
  },
  resolve: {
    // ⚠ `@/*` is declared in THREE places that must stay in lockstep: here (the
    // only one `npm run build` reads), config/tsconfig.json, and the root
    // tsconfig.json (what every `tsx --tsconfig` script resolves, validation
    // included). The 3D app is a separate repository now with its own config,
    // where `@` means its own source root; the two cannot collide.
    alias: {
      '@': path.resolve(__dirname, '../src'),
    },
  },
  build: {
    rollupOptions: {
      // ⚠ Every page the site publishes is named here, and config/check-dist.mjs
      // asserts dist/html matches this list EXACTLY — an entry missing from
      // either side fails the build. `wrangler deploy` uploads all of dist/
      // unfiltered, so this list is the whole guest list for a public site.
      input: {
        index: path.resolve(__dirname, '../html/index.html'),
        app: path.resolve(__dirname, '../html/app.html'),
        donation: path.resolve(__dirname, '../html/donation.html'),
      },
    },
  },
})
