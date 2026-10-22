import type { Page } from '@playwright/test';

import type { SiteShot } from '../../../packages/website/src/@types/SiteShot';
import type { SkymapWindow } from '../../../src/@types/automation/SkymapWindow';

const CONNECT_TIMEOUT_MS = 20_000;

/**
 * The remote page of the `?remote` dome open in `dome`, screenshotted once it
 * reads "Connected". It opens in the dome's own context at the row's size, so
 * the phone and the dome that pairs with it share a relay and a clock.
 */
export async function shootPairedRemote(dome: Page, base: string, shot: SiteShot): Promise<Buffer> {
  const code = await dome.evaluate(
    () => (window as unknown as SkymapWindow).__skymap!.getState().remote.code,
  );
  if (!code) throw new Error('the dome has no room code; is it open with ?remote?');
  const phone = await dome.context().newPage();
  await phone.setViewportSize(shot.size);
  await phone.goto(`${base.replace(/\/+$/, '')}/remote.html#${code}`, { waitUntil: 'load' });
  await phone
    .getByRole('status')
    .filter({ hasText: /^Connected$/ })
    .waitFor({ timeout: CONNECT_TIMEOUT_MS });
  return phone.screenshot({ type: 'png' });
}
