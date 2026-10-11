import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser } from '@playwright/test';

const OUT = 'packages/website/src/assets/og-card.jpg';
const CARD_SHOT = 'og-card';
const FONT = join(import.meta.dirname, '../fonts/CormorantGaramond-SemiBold.ttf');
const W = 1200;
const H = 630;

const dataUrl = (path: string, mime: string) =>
  `data:${mime};base64,${readFileSync(path).toString('base64')}`;

/**
 * The website's link-preview card: the manifest's `og-card` render, the
 * wordmark and the site's one claim, with no counts (a count dates, and the
 * page itself prints none). 1200x630 is what every preview crops least; JPEG
 * keeps it under the 600 KB above which WhatsApp drops a preview. Set in the
 * browser, not as SVG text through sharp: librsvg would need fontconfig to
 * find the repo's Cormorant, and silently falls back to Times without it.
 */
export async function makeSiteOgCard(browser: Browser, mastersDir: string): Promise<void> {
  const master = join(mastersDir, `${CARD_SHOT}.png`);
  if (!existsSync(master)) return;
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  // The words sit lower left, on the dark side of the frame; the scrim only guards against a bright star under them.
  await page.setContent(`<style>
      @font-face { font-family: Card; font-weight: 600; src: url(${dataUrl(FONT, 'font/ttf')}); }
      body { margin: 0; width: ${W}px; height: ${H}px; background: #000 url(${dataUrl(master, 'image/png')}) center / cover; }
      div { position: absolute; inset: 0; padding: 0 0 64px 72px; display: flex; flex-direction: column; justify-content: flex-end;
        background: linear-gradient(90deg, rgb(0 0 0 / 0.75), rgb(0 0 0 / 0) 62%); font: 600 50px/1.1 Card; color: #dfe6fb; }
      b { font-size: 176px; line-height: 0.95; letter-spacing: -0.015em; color: #fff; }
    </style><div><b>skymap</b>The mapped universe at true scale</div>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: OUT, type: 'jpeg', quality: 88 });
  await page.close();
  console.log(`og-card  ${Math.round(statSync(OUT).size / 1024)} KB`);
}
