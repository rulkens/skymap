import type { Page } from '@playwright/test';

import type { SiteShot } from '../../../packages/website/src/@types/SiteShot';
import { readCanvas } from '../../utils/shot/readCanvas';
import { openSiteShot } from './openSiteShot';
import { shootElement } from './shootElement';
import { shootPairedRemote } from './shootPairedRemote';

// Typed as a person types, then long enough for the palette's results to land.
const KEY_DELAY_MS = 60;
const RESULTS_SETTLE_MS = 1200;
// A panel section unfolds over a short transition.
const PANEL_SETTLE_MS = 600;
// `minimalUi`: the app's own accessible names, which its CSS-module class names are not stable enough to be.
const MINIMAL_UI_CSS = [
  'Navigation cheatsheet',
  'Renderer settings',
  'Scale reference',
  'Time controls',
]
  .map((name) => `[aria-label="${name}"]`)
  .join(', ')
  .concat(' { visibility: hidden !important; }');

/**
 * The full-size PNG of one shot row, taken from the app at `base` in a page sized to the row:
 * its link and settings applied, then the canvas alone, or with `ui` the page, one element of it,
 * or a paired phone remote.
 */
export async function captureSiteShot(
  page: Page,
  base: string,
  shot: Pick<SiteShot, 'link' | 'query' | 'settings' | 'size'>,
): Promise<Buffer> {
  await openSiteShot(page, base, shot);
  if (shot.settings?.searchFor !== undefined && !shot.settings.remote) {
    await page.keyboard.press('/');
    await page.keyboard.type(shot.settings.searchFor, { delay: KEY_DELAY_MS });
    await page.waitForTimeout(RESULTS_SETTLE_MS);
  }
  for (const heading of shot.settings?.open ?? []) {
    // The heading's own text, not the button's name: a heading with a switch is named after both.
    await page.locator('button', { has: page.locator(`span:text-is("${heading}")`) }).click();
    await page.waitForTimeout(PANEL_SETTLE_MS);
  }
  if (shot.settings?.minimalUi) await page.addStyleTag({ content: MINIMAL_UI_CSS });
  // A `ui` shot is the page as a visitor sees it; the rest are the canvas alone.
  if (shot.settings?.remote) return shootPairedRemote(page, base, shot);
  if (shot.settings?.element) return shootElement(page, shot.settings.element);
  return shot.settings?.ui ? page.screenshot({ type: 'png' }) : readCanvas(page, 'png');
}
