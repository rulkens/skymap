import type { Page } from '@playwright/test';

import type { SiteShot } from '../../../packages/website/src/@types/SiteShot';
import type { SkymapWindow } from '../../../src/@types/automation/SkymapWindow';
import { bootHookedPage } from '../../utils/browser/bootHookedPage';
import { dispatchActions } from '../../utils/browser/dispatchActions';
import { siteShotActions } from './siteShotActions';
import { siteShotUrl } from './siteShotUrl';

/** Opens a manifest picture in the app at `base`, applies its row's settings and waits until the frame holds still. */
export async function openSiteShot(page: Page, base: string, shot: SiteShot): Promise<void> {
  await bootHookedPage(page, siteShotUrl(base, shot));
  await dispatchActions(page, siteShotActions(shot));
  const settled = () =>
    page.evaluate(() => (window as unknown as SkymapWindow).__skymap!.settled());
  await settled();
  if (shot.settings?.settleMs) {
    await page.waitForTimeout(shot.settings.settleMs);
    await settled();
  }
}
