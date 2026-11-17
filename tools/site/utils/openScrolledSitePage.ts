import type { Browser, Page } from '@playwright/test';

const HEIGHT_FOR_WIDTH: Record<number, number> = { 1440: 900, 1024: 768, 400: 860 };
// The dev overlay marks all it adds with data-overlay-ui (dev/overlay/overlayUi.ts).
const HIDE =
  '[data-overlay-ui], astro-dev-toolbar, header:has(nav[aria-label="Main"]) { display: none !important; }';
// One scroll step per 0.6 viewport, each long enough for a lazy picture to start and decode.
const STEP_MS = 120;

/**
 * A page of the running site at `width`, scrolled through once so lazy pictures load and back at
 * the top, with the dev overlays and the fixed bar (which would sit over every shot) hidden.
 */
export async function openScrolledSitePage(
  browser: Browser,
  url: string,
  width: number,
  deviceScaleFactor = 1,
): Promise<Page> {
  const height = HEIGHT_FOR_WIDTH[width] ?? 900;
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor });
  // Another agent's edit makes the dev server reload the page mid-run; a socket that never hears the
  // server keeps the page as loaded. Refusing it instead would make Vite's client reload on reconnect.
  await page.routeWebSocket(/./, () => {});
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: HIDE });
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < total; y += Math.round(height * 0.6)) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(STEP_MS);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  return page;
}
