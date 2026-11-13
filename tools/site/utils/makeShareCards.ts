import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser } from '@playwright/test';

import { SHARE_CARD_SIZE } from '../../../packages/website/src/data/shareCardSize';
import { SHARE_CARDS } from '../../../packages/website/src/data/shareCards';
import { pageLabel } from '../../../packages/website/src/utils/pageLabel';
import { shareCardFile } from '../../../packages/website/src/utils/shareCardFile';
import { PRESS_KIT } from '../pressKitPlan';
import { wordmarkSvg } from './wordmarkSvg';

// The app's card (index.html, a root-absolute public file) and the site's card for every page without its own.
const SITE_CARD_OUTS = ['public/og-image.jpg', 'packages/website/src/assets/og-card.jpg'];
const SITE_CARD_LINE = 'The mapped universe at true scale';
const PAGE_CARDS_DIR = 'packages/website/src/assets/cards';
const FONT = join(import.meta.dirname, '../fonts/CormorantGaramond-SemiBold.ttf');
const { width: W, height: H } = SHARE_CARD_SIZE;

const dataUrl = (data: string | Buffer, mime: string) =>
  `data:${mime};base64,${Buffer.from(data).toString('base64')}`;

/**
 * The link-preview cards: a render, the site's Wordmark (the press kit's light logo) and one line, the site's
 * claim or a landing page's name, with no counts (a count dates). 1200x630 is what every preview crops least;
 * JPEG keeps it under the 600 KB above which WhatsApp drops a preview. Set in the browser, not as SVG text
 * through sharp: librsvg would need fontconfig to find the repo's Cormorant, and falls back to Times without it.
 */
export async function makeShareCards(browser: Browser, mastersDir: string): Promise<void> {
  const font = dataUrl(readFileSync(FONT), 'font/ttf');
  const logo = dataUrl(wordmarkSvg(readFileSync(FONT), PRESS_KIT.inks.light), 'image/svg+xml');
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const card = async (shot: string, line: string, backdrop = 'center / cover') => {
    const master = join(mastersDir, `${shot}.png`);
    if (!existsSync(master)) return undefined;
    // The words sit lower left, on the dark side of the frame; the scrim only guards against a bright star under them.
    await page.setContent(`<style>
        @font-face { font-family: Card; font-weight: 600; src: url(${font}); }
        body { margin: 0; width: ${W}px; height: ${H}px; background: #000 url(${dataUrl(readFileSync(master), 'image/png')}) ${backdrop}; }
        div { position: absolute; inset: 0; padding: 0 0 64px 72px; display: flex; flex-direction: column; justify-content: flex-end;
          background: linear-gradient(90deg, rgb(0 0 0 / 0.75), rgb(0 0 0 / 0) 62%); font: 600 50px/1.1 Card; color: #dfe6fb; }
        img { width: 620px; margin: 0 0 18px -4px; }
        p { margin: 0; display: flex; gap: 0.45em; text-shadow: 0 0 14px rgb(0 0 0 / 0.9); } span { color: #9aa7c9; }
      </style><div><img src="${logo}" alt=""><p>${line}</p></div>`);
    await page.evaluate(() => document.fonts.ready);
    return page.screenshot({ type: 'jpeg', quality: 88 });
  };
  try {
    const site = await card('og-card', SITE_CARD_LINE);
    if (site) for (const out of SITE_CARD_OUTS) writeFileSync(out, site);
    mkdirSync(PAGE_CARDS_DIR, { recursive: true });
    for (const { path, shot, backdrop } of SHARE_CARDS) {
      // The page's name, then the site's claim subdued beside it, at the same size.
      const jpeg = await card(shot, `${pageLabel(path)}<span>${SITE_CARD_LINE}</span>`, backdrop);
      if (!jpeg) continue;
      writeFileSync(join(PAGE_CARDS_DIR, shareCardFile(path)), jpeg);
      console.log(`card ${path}  ${Math.round(jpeg.length / 1024)} KB`);
    }
  } finally {
    await page.close();
  }
}
