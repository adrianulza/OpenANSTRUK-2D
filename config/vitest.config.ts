import { defineConfig } from 'vitest/config'
import path from 'path'

// Unit tests for the pure domain code in src/lib. Kept separate from
// vite.config.ts so the test runner does not load the dev-server plugins.
// ⚠ The `@` alias must match config/vite.config.ts and both tsconfig files.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../src'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    root: path.resolve(__dirname, '..'),
  },
})
