/**
 * bootHookedPage — navigate to `url`, wait for `window.__skymap`, then await its
 * `ready` promise. Retries the wait (not the goto) up to 2 times: Vite's
 * one-time dependency-optimize reload on a cold cache destroys the execution
 * context mid-wait, and the reloaded page reinstalls the hook and boots again
 * in real time.
 */
import type { Page } from '@playwright/test';
import { isNavigationInterruption } from './isNavigationInterruption';
import type { SkymapWindow } from '../../../src/@types/automation/SkymapWindow';

const HOOK_TIMEOUT_MS = 15_000;
const MAX_BOOT_NAVIGATIONS = 2;

export async function bootHookedPage(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'load' });
  for (let navigations = 0; ; navigations++) {
    try {
      await waitForHookReady(page, url);
      return;
    } catch (err) {
      if (!isNavigationInterruption(err) || navigations >= MAX_BOOT_NAVIGATIONS) throw err;
      console.warn(`[boot] page navigated during the ready wait (${url}) — retrying`);
    }
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
        "the server is not running this branch's build (is the dev server started from this checkout?)",
    );
  }
  // `ready` already debounces "engine ready + loads settled" over a ~1 s
  // window, so awaiting it (no harness-side timeout) is the whole boot wait.
  await page.evaluate(() => (window as unknown as SkymapWindow).__skymap!.ready);
}
