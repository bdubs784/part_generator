import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:4173/part_generator/',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run build && npx vite preview --port 4173 --strictPort',
      url: 'http://localhost:4173/part_generator/',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { VITE_API_URL: 'http://127.0.0.1:8787' },
    },
    {
      // local Worker + local D1, migrated fresh; high write limit so reruns don't hit 429
      command: 'npm run api:migrate:local && npm run api:dev -- --var WRITE_LIMIT:10000',
      url: 'http://127.0.0.1:8787/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { CI: 'true', WRANGLER_SEND_METRICS: 'false' },
    },
  ],
})
