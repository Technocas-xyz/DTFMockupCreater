import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Disable source maps in production (prevents source code exposure)
    sourcemap: false,
    // Minify aggressively
    minify: 'esbuild',
    // Remove console.log in production
    esbuild: {
      drop: ['debugger'],
    },
  },
})
