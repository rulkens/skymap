/**
 * Famous-curator smoke test — drives the full happy path through the UI.
 *
 * 1. Load the page, wait for the galaxy list.
 * 2. Click an entry.
 * 3. Paste a real URL into the source bar, click Fetch.
 * 4. Wait for the crop overlay.
 * 5. Click Process, wait for the previews.
 * 6. Fill metadata.
 * 7. Click Export, assert the trio files appear on disk.
 *
 * Uses the same test URL as the API curl smoke in Plan B (a small
 * Wikipedia commons hosted M31 thumbnail) so the network dependency
 * is minimal and consistent.
 *
 * Run via:
 *   npx playwright test --config playwright.curator.config.ts
 *
 * The `webServer` block in playwright.curator.config.ts boots the curator
 * dev server with MOCK_STARNET=1, which makes /api/process skip the real
 * StarNet binary and return synthetic output — keeping the test hermetic
 * with respect to that optional binary dependency.
 */
import { test, expect } from '@playwright/test';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const TEST_URL =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/M31bobo.jpg/640px-M31bobo.jpg';
const TEST_ID = 'm31';

test('curator happy path: select → fetch → process → export', async ({ page }) => {
  // Clean any leftover artefacts from prior runs so the test sees a
  // clean baseline.  resolve() is relative to CWD at test-runner start,
  // which Playwright sets to the project root.
  const outDir = resolve(process.cwd(), 'public/images/famous-curated', TEST_ID);
  const overrides = resolve(process.cwd(), 'data/famous_curated_overrides.json');
  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
  if (existsSync(overrides)) rmSync(overrides);

  await page.goto('/');

  // Galaxy list shows up.  The list is rendered once the JSON sidecar
  // is fetched by the UI — 10 s is generous for localhost.
  await expect(page.getByRole('list').getByText('M31')).toBeVisible({ timeout: 10_000 });

  // 1. Select M31.
  await page.getByText('M31').click();

  // 2. Paste URL and fetch.  The label text comes from the SourceBar
  //    component — update here if the label wording changes.
  await page.getByLabel(/source url to fetch/i).fill(TEST_URL);
  await page.getByRole('button', { name: /^fetch$/i }).click();

  // 3. Wait for the crop readout.  The CropPanel shows "X × Y of W × H source"
  //    once the image has been fetched and its natural dimensions are known.
  //    15 s covers a slow network for the ~40 kB Wikipedia thumb.
  await expect(page.getByText(/of \d+ × \d+ source/)).toBeVisible({ timeout: 15_000 });

  // 4. Click Process — wait for the alpha preview img to appear.
  //    With MOCK_STARNET=1 the backend skips the StarNet binary and returns
  //    synthetic WebP data, so 30 s is far more than enough.
  await page.getByRole('button', { name: /^process$/i }).click();
  await expect(page.getByAltText('alpha')).toBeVisible({ timeout: 30_000 });

  // 5. Fill metadata.  These fields live in the MetadataForm component.
  await page.getByLabel(/^source url$/i).fill(TEST_URL);
  await page.getByLabel(/license/i).fill('CC-BY-SA-4.0');
  await page.getByLabel(/author/i).fill('Test Author');

  // 6. Click Export.  The button is disabled until process has finished;
  //    the poll above already guarantees the preview is visible, so the
  //    5 s timeout is just a safety margin.
  const exportBtn = page.getByRole('button', { name: /^export$/i });
  await expect(exportBtn).toBeEnabled({ timeout: 5_000 });
  await exportBtn.click();

  // 7. Assert files on disk + the list flips to curated.
  //    The four WebPs: atlas (resized for the in-app texture), full (high-res
  //    display), source (original crop, pre-StarNet), starless (StarNet output).
  //    recipe.json records the processing parameters for reproducibility.
  //    overrides JSON is the structured sidecar that the build pipeline reads.
  await expect
    .poll(() => existsSync(resolve(outDir, 'atlas.webp')), { timeout: 10_000 })
    .toBe(true);
  expect(existsSync(resolve(outDir, 'full.webp'))).toBe(true);
  expect(existsSync(resolve(outDir, 'source.webp'))).toBe(true);
  expect(existsSync(resolve(outDir, 'starless.webp'))).toBe(true);
  expect(existsSync(resolve(outDir, 'recipe.json'))).toBe(true);
  expect(existsSync(overrides)).toBe(true);

  // Cleanup — remove artefacts so repeated local runs start clean.
  rmSync(outDir, { recursive: true, force: true });
  rmSync(overrides);
});
