/**
 * bootHookedPage — navigate to `url`, wait for `window.__skymap`, then await its
 * `ready` promise. A page that reloads meanwhile (Vite's one-time
 * dependency-optimize reload on a cold cache, or an HMR full reload) is opened
 * afresh from `url`, up to 2 times: the reload would boot from the hash the app
 * has since rewritten, which drops a link's read-only `pose` and so shows
 * another view.
 */
import type { Page } from '@playwright/test';
import { isNavigationInterruption } from './isNavigationInterruption';
import { wasReloaded } from './wasReloaded';
import type { SkymapWindow } from '../../../src/@types/automation/SkymapWindow';

const HOOK_TIMEOUT_MS = 15_000;
const MAX_BOOT_NAVIGATIONS = 2;

export async function bootHookedPage(page: Page, url: string): Promise<void> {
  for (let navigations = 0; ; navigations++) {
    // Via a blank page: a goto that differs only in its hash is a same-document
    // hash change, which the app would fly to rather than boot on.
    if (navigations > 0) await page.goto('about:blank');
    await page.goto(url, { waitUntil: 'load' });
    try {
      await waitForHookReady(page, url);
      if (!(await wasReloaded(page))) return;
    } catch (err) {
      if (!isNavigationInterruption(err)) throw err;
    }
    if (navigations >= MAX_BOOT_NAVIGATIONS) {
      throw new Error(`the page kept reloading while it booted ${url}`);
    }
    console.warn(`[boot] page reloaded during the ready wait (${url}) — opening the link again`);
  }
}

async function waitForHookReady(page: Page, url: string): Promise<void> {
  try {
    await page.waitForFunction(
      () => (window as unknown as SkymapWindow).__skymap !== undefined,
      undefined,
      { timeout: HOOK_TIMEOUT_MS, polling: 100 },
    );
  } catch (err) {
    if (isNavigationInterruption(err)) throw err;
    throw new Error(
      `window.__skymap never appeared within ${HOOK_TIMEOUT_MS} ms at ${url} — ` +
        "the server is not running this branch's build (is the dev server started from this checkout?), " +
        'or it is stale — restart it (see "504 Outdated Optimize Dep" in tools/perf/README.md)',
    );
  }
  // `ready` already debounces "engine ready + loads settled" over a ~1 s
  // window, so awaiting it (no harness-side timeout) is the whole boot wait.
  await page.evaluate(() => (window as unknown as SkymapWindow).__skymap!.ready);
}
