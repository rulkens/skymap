import type { Page } from '@playwright/test';
import type { UnknownAction } from '@reduxjs/toolkit';
import type { SkymapWindow } from '../../../src/@types/automation/SkymapWindow';

/** Dispatches actions into the running app's store, in order, through the base hook. */
export async function dispatchActions(page: Page, actions: UnknownAction[]): Promise<void> {
  await page.evaluate((queued) => {
    const h = (window as unknown as SkymapWindow).__skymap!;
    for (const action of queued) h.dispatch(action);
  }, actions);
}
