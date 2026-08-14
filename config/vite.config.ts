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
        server.middlewares.use((req, _res, next) => {
          if (req.url === '/') req.url = '/html/index.html'
          // `/app` is the original URL and is linked from published posts — it stays.
          // `/2d` is the new canonical path, added alongside it.
          if (req.url === '/app' || req.url === '/app/') req.url = '/html/app.html'
          if (req.url === '/2d' || req.url === '/2d/') req.url = '/html/app.html'
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
    // `@` is the 2D app. The 3D app is a separate self-contained project under
    // src/3d with its own vite config, where `@` means its own source root.
    alias: {
      '@': path.resolve(__dirname, '../src/2d'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, '../html/index.html'),
        app: path.resolve(__dirname, '../html/app.html'),
      },
    },
  },
})
