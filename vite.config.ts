import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // GitHub Pages serves the site from /<repo>/
  base: '/part_generator/',
  plugins: [react()],
  // the geometry worker lazy-loads the OpenCascade glue, which needs ES workers
  worker: { format: 'es' },
  optimizeDeps: {
    // the wasm loader breaks when esbuild pre-bundles it
    exclude: ['replicad-opencascadejs'],
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
