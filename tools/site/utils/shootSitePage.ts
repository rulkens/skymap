import type { Browser } from '@playwright/test';

const HEIGHT_FOR_WIDTH: Record<number, number> = { 1440: 900, 400: 860 };
// Fonts and the first pictures settle in a few frames; the Home flight keeps the network busy, so never wait for idle.
const SETTLE_MS = 500;

/**
 * One full-page PNG of `url` with everything that moves held still: reduced motion
 * (the gallery, drift and film scripts stand down and the flight shows its stills),
 * paused videos, no CSS animation, and `performance.now` fixed, since the footer and
 * the remark lines print the time since load. Requests off localhost are refused.
 */
export async function shootSitePage(browser: Browser, url: string, width: number): Promise<Buffer> {
  const context = await browser.newContext({
    viewport: { width, height: HEIGHT_FOR_WIDTH[width] ?? 900 },
    reducedMotion: 'reduce',
    deviceScaleFactor: 1,
  });
  try {
    await context.addInitScript(() => {
      performance.now = () => 1000;
    });
    await context.route(
      (target) => target.hostname !== 'localhost',
      (route) => route.abort(),
    );
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'load' });
    // No helper function in here: tsx wraps a named one in a call the page does not have.
    await page.evaluate(async () => {
      for (const img of document.querySelectorAll('img[loading="lazy"]')) {
        (img as HTMLImageElement).loading = 'eager';
      }
      for (const video of document.querySelectorAll('video')) {
        video.pause();
        video.currentTime = 0;
      }
      await document.fonts.ready;
      // decode() can settle before a lazy image the page just set to eager has started to load.
      await Promise.all(
        [...document.images].map(async (img) => {
          if (!img.complete) {
            await new Promise((done) => {
              img.addEventListener('load', done, { once: true });
              img.addEventListener('error', done, { once: true });
            });
          }
          await img.decode().catch(() => undefined);
        }),
      );
      // A picture below the fold is sometimes left unpainted in a full-page capture; passing every screen of
      // it once, as a reader scrolling would, has the browser draw each.
      for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight) {
        window.scrollTo(0, y);
        await new Promise((frame) => requestAnimationFrame(frame));
      }
      // The docs list scrolls itself to the current page at parse time, from a row position that moves with
      // font loading (750 or 792 px on one page), so every scrolled box goes back to its top.
      for (const el of document.querySelectorAll('*')) if (el.scrollTop > 0) el.scrollTop = 0;
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(SETTLE_MS);
    return await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' });
  } finally {
    await context.close();
  }
}
