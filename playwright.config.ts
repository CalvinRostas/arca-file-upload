import { defineConfig } from '@playwright/test'

const port = 3100
const baseURL = `http://localhost:${port}`
process.env.E2E_ORIGIN = baseURL

/** Smoke tests against a production build with a throwaway in-memory database. Run locally: `bun run test:e2e`. */
export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: { baseURL, trace: 'retain-on-failure' },
  webServer: {
    command: 'ARCA_E2E=1 bun run build && node .output-e2e/server/index.mjs',
    url: `${baseURL}/api/session`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      PORT: String(port),
      NUXT_DATABASE_URL: 'pglite:memory',
      NUXT_BASE_URL: baseURL,
      NUXT_AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e',
      // Small chunks, so a few MB exercise multi-chunk resume.
      NUXT_PUBLIC_UPLOAD_CHUNK_BYTES: String(256 * 1024),
    },
  },
})
