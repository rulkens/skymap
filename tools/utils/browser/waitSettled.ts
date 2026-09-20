import type { Page } from '@playwright/test';
import { cameraRoute, engineRoute } from '../../../src/store/constants';
import type { RootState } from '../../../src/store/types';
import type { SkymapPerfHook } from '../../../src/@types/perf/SkymapPerfHook';

const SETTLE_HOLD_MS = 1000;

const SETTLE_POLL_MS = 250;

const SETTLE_TIMEOUT_MS = 90_000;

export async function waitSettled(page: Page, label: string): Promise<void> {
  const deadline = Date.now() + SETTLE_TIMEOUT_MS;
  let settledSince: number | null = null;
  for (;;) {
    const settled = await page.evaluate(
      ({ cameraKey, engineKey }) => {
        const h = (window as unknown as { __skymapPerf: SkymapPerfHook }).__skymapPerf;
        // Typed against the real store: these four field names are the whole
        // settle contract, and an unchecked read of a renamed one is silently
        // never-settled — 90 s per card, blaming the wrong thing.
        const state = h.getState() as unknown as RootState;
        const camera = state[cameraKey];
        const busy = camera.clip !== null || camera.tween !== null || camera.frameTween !== null;
        const loading = state[engineKey].loadProgress !== null;
        return !busy && !loading;
      },
      { cameraKey: cameraRoute, engineKey: engineRoute },
    );
    if (settled) {
      settledSince ??= Date.now();
      if (Date.now() - settledSince >= SETTLE_HOLD_MS) return;
    } else {
      settledSince = null;
    }
    if (Date.now() > deadline) {
      throw new Error(`card '${label}' never settled within ${SETTLE_TIMEOUT_MS} ms`);
    }
    await page.waitForTimeout(SETTLE_POLL_MS);
  }
}
