import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Use a relative base path so GitHub Pages and local previews resolve assets
  // from the same bundle without depending on the repo name.
  base: './',
  build: {
    outDir: 'docs',
    emptyOutDir: true,
  },
})
