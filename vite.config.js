import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Default build is a normal multi-file bundle (what Vercel serves).
// `npm run build:single` (SINGLE_FILE=1) inlines JS + CSS into one dist/index.html for sharing as a single file.
export default defineConfig({
  plugins: [react(), ...(process.env.SINGLE_FILE ? [viteSingleFile()] : [])],
  test: {
    include: ['tests/**/*.test.{js,jsx}', 'server/**/*.test.js'],
    testTimeout: 30000,
    hookTimeout: 60000,
  },
})
