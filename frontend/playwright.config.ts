import { defineConfig, devices } from '@playwright/test'

const PORT = 5179

// The app runs against a fake API origin that every test mocks with page.route, so the
// e2e suite needs no backend and never touches staging/prod.
export const E2E_API_URL = 'http://api.e2e.test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    // Real env vars beat .env, so this points the app at the mocked origin.
    env: { VITE_API_URL: E2E_API_URL, VITE_API_BASE_PATH: '/api' },
  },
})
