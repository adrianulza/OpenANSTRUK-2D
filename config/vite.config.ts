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
    alias: {
      '@': path.resolve(__dirname, '../src'),
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
