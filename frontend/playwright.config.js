import { defineConfig, devices } from '@playwright/test';

// Opt-in E2E for the vanilla frontend. Spins up a static server on :4173 and
// runs the smoke + a11y specs across desktop + mobile viewports. Not part of the
// monorepo `pnpm test` pipeline — run explicitly via `npm run test:e2e`.
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npx --yes serve -l 4173 .',
    url: 'http://localhost:4173/index.html',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 13'] } },
  ],
});
