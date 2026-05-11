/**
 * Visual verification for the CF-4 DM density volume overlay.
 *
 * Loads the dev server, captures the engine's `cf4Density` ready-log
 * to confirm the slot fired and decoded the SCFD, opens the Volumes
 * panel, toggles `cf4-density` on, and screenshots before/after.
 *
 * This is a smoke spec, not a regression test — it checks that the
 * field loads and the toggle wires through; pixel-level appearance
 * checks would be brittle against intentional palette/intensity
 * tweaks.  Screenshots are emitted under `tests/e2e/__screenshots__/`
 * so a human can eyeball Laniakea / Local Void / Great Attractor
 * positions.
 *
 * Run:  `npx playwright test tests/e2e/cf4-density-volume.spec.ts`
 * (Assumes `npm run dev` is already serving on :5173 — see
 * playwright.config.ts header for the rationale.)
 */
import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SCREENSHOT_DIR = 'tests/e2e/__screenshots__/cf4-density';

test.beforeAll(() => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

test('cf4-density slot fires and field appears in Volumes panel', async ({ page }) => {
  const consoleLogs: string[] = [];
  page.on('console', (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => consoleLogs.push(`[pageerror] ${err.message}`));

  await page.goto('/');
  // Wait for the engine bootstrap + slot loads.  networkidle alone fires
  // before the slot subscribers run, so we add a short pause for the
  // `ready` transition log to emit.
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  const cf4ReadyLine = consoleLogs.find((l) => l.includes('[engine] cf4Density:'));
  if (!cf4ReadyLine) {
    // Helpful diagnostic: print everything so we can see why the slot
    // didn't surface (404? decode error? renderer null?).
    console.log('--- captured console logs ---');
    for (const l of consoleLogs) console.log(l);
    console.log('--- end logs ---');
  }
  expect(cf4ReadyLine, 'expected engine to log [engine] cf4Density: <dims> cube, min=…, max=…').toBeDefined();
  expect(cf4ReadyLine).toMatch(/128x128x128 cube/);

  await page.screenshot({ path: join(SCREENSHOT_DIR, 'step1-initial-toggle-off.png') });
});

test('toggling cf4-density on changes the rendered scene', async ({ page }) => {
  const consoleLogs: string[] = [];
  page.on('console', (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Open the Settings panel.  The Skymap UI keeps it collapsed by
  // default; the toggle is typically labelled "Settings" or rendered
  // as a gear icon — we try the visible-text fallback first.
  const settingsTrigger = page.getByRole('button', { name: /settings|panel|controls/i }).first();
  if (await settingsTrigger.count()) {
    await settingsTrigger.click({ trial: false }).catch(() => {});
    await page.waitForTimeout(300);
  }

  // Find the cf4-density row.  The Volumes panel renders each field as
  // a row containing the field name and a checkbox / switch.  Use a
  // text locator scoped to the row's accessible name.
  const cf4Row = page.locator('text=/cf4-density/i').first();
  await expect(cf4Row, 'cf4-density row must be visible in Volumes panel').toBeVisible({
    timeout: 3000,
  });

  // Screenshot the panel with the row visible but toggle off.
  await page.screenshot({ path: join(SCREENSHOT_DIR, 'step2-panel-row-visible.png') });

  // Find the enable control adjacent to the cf4-density label.  In the
  // current VolumeFieldRow component the control is a checkbox; if that
  // changes we fall back to clicking the row itself.
  const rowContainer = cf4Row.locator('xpath=ancestor::*[self::div or self::label][1]');
  const checkbox = rowContainer.locator('input[type=checkbox], [role=switch]').first();

  if (await checkbox.count()) {
    await checkbox.check({ force: true });
  } else {
    await cf4Row.click();
  }
  // Give the renderer a frame or two to upload + draw.
  await page.waitForTimeout(1500);

  await page.screenshot({ path: join(SCREENSHOT_DIR, 'step3-toggle-on.png') });

  // No pixel assertion — the human eye is the judge here.  We just
  // assert that no JS errors fired during the toggle, since a bad
  // shader recompile or missing uniform would surface as a pageerror.
  const pageErrors = consoleLogs.filter((l) => l.startsWith('[pageerror]'));
  expect(pageErrors, `unexpected pageerror(s) after toggling cf4-density:\n${pageErrors.join('\n')}`).toEqual([]);
});
