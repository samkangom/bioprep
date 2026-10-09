import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// viteSingleFile inlines JS + CSS into dist/index.html so the whole prototype is one shareable file.
// For a real deployment you can remove viteSingleFile() and deploy dist/ normally.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
})
