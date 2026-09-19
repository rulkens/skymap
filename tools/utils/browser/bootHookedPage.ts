/**
 * bootHookedPage — navigate to `url`, wait for `window[hook]`, then await its
 * `ready` promise. Retries the wait (not the goto) up to 2 times: Vite's
 * one-time dependency-optimize reload on a cold cache destroys the execution
 * context mid-wait, and the reloaded page reinstalls the hook and boots again
 * in real time.
 */
import type { Page } from '@playwright/test';
import { isNavigationInterruption } from './isNavigationInterruption';

const HOOK_TIMEOUT_MS = 15_000;
const MAX_BOOT_NAVIGATIONS = 2;

export async function bootHookedPage(
  page: Page,
  url: string,
  hook: '__skymapPerf' | '__skymapRecorder',
): Promise<void> {
  await page.goto(url, { waitUntil: 'load' });
  for (let navigations = 0; ; navigations++) {
    try {
      await waitForHookReady(page, url, hook);
      return;
    } catch (err) {
      if (!isNavigationInterruption(err) || navigations >= MAX_BOOT_NAVIGATIONS) throw err;
    }
  }
}

async function waitForHookReady(page: Page, url: string, hook: string): Promise<void> {
  try {
    await page.waitForFunction(
      (h) => (window as unknown as Record<string, unknown>)[h] !== undefined,
      hook,
      { timeout: HOOK_TIMEOUT_MS, polling: 100 },
    );
  } catch (err) {
    if (isNavigationInterruption(err)) throw err;
    throw new Error(
      `window.${hook} never appeared within ${HOOK_TIMEOUT_MS} ms at ${url} — ` +
        'is the dev server running this branch?',
    );
  }
  // `ready` already debounces "engine ready + loads settled" over a ~1 s
  // window, so awaiting it (no harness-side timeout) is the whole boot wait.
  await page.evaluate(
    (h) => (window as unknown as Record<string, { ready: Promise<void> }>)[h]!.ready,
    hook,
  );
}
