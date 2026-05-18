/**
 * Playwright config for the famous-galaxy curator smoke test.
 *
 * Boots the curator dev server with MOCK_STARNET=1 so the test doesn't
 * need the real StarNet binary installed.  The mock makes /api/process
 * return synthetic WebP output, keeping the test hermetic with respect
 * to that optional binary dependency.
 *
 * Not run in CI (CI doesn't have a port-5200 reservation or a headed
 * browser); meant for local pre-PR verification of the curator.
 * Add to CI later if the test set grows beyond a single smoke check.
 *
 * Run with:
 *   npx playwright test --config playwright.curator.config.ts
 *
 * If Chromium is not installed yet:
 *   npx playwright install chromium
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/playwright',
  // Match `.spec.ts` only so this config stays out of the vitest glob.
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5200',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // webServer boots the curator Vite dev server before any test runs.
  // reuseExistingServer lets a local developer keep the server running
  // between test runs — avoids the ~5 s cold-start cost each time.
  // In CI (process.env.CI is set by GitHub Actions), always boot fresh
  // to avoid stale state from a prior job step.
  webServer: {
    command: 'MOCK_STARNET=1 npm run curate-famous',
    url: 'http://localhost:5200',
    timeout: 30_000,
    reuseExistingServer: !process.env.CI,
  },
});
