import type { Page } from '@playwright/test';
import type { UnknownAction } from '@reduxjs/toolkit';
import type { SkymapPerfHook } from '../../../src/state/perf/@types/SkymapPerfHook';

/** Dispatches actions into the running app's store, in order, through the perf hook. */
export async function dispatchActions(page: Page, actions: UnknownAction[]): Promise<void> {
  await page.evaluate((queued) => {
    const h = (window as unknown as { __skymapPerf: SkymapPerfHook }).__skymapPerf;
    for (const action of queued) h.dispatch(action);
  }, actions);
}
