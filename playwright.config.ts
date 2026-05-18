/**
 * Playwright config for visual / end-to-end verification of the Skymap
 * renderer.  Sits alongside the vitest unit-test suite (vitest.config.ts);
 * the two don't share files — vitest covers pure logic + WebGPU-mocked
 * units, Playwright covers real-browser scenes that require a running
 * dev server and a real WebGPU context.
 *
 * Tests live under `tests/e2e/` to keep them out of the vitest globbing
 * pattern (which scans `tests/` for `*.test.ts`).  Each spec file uses
 * the `.spec.ts` extension to make the split unambiguous.
 *
 * The dev server is *not* started by Playwright (no `webServer` config):
 * the CLAUDE.md convention is "leave `npm run dev` running for HMR".
 * Tests assume http://localhost:5173 is already up and fail loudly if
 * it isn't — running them is an explicit visual-check step, not part of
 * the default CI flow.
 *
 * Famous-curator smoke tests live separately under `tests/playwright/` and
 * are driven by `playwright.curator.config.ts`, which boots the curator
 * dev server on :5200 with MOCK_STARNET=1.  That config is the correct
 * entry point for `npx playwright test --config playwright.curator.config.ts`.
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  // Match `.spec.ts` only — vitest globs `*.test.ts`, this split keeps
  // the two runners from picking up each other's files.
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    // Real WebGPU needs a real GPU process; headless Chrome still works
    // on macOS / Linux because Playwright bundles a Chromium that has
    // WebGPU enabled by default.
    headless: true,
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
