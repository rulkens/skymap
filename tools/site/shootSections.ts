/**
 * Section screenshots of one page of the running website, for a design round trip: at each width it
 * scrolls the whole page once so lazy pictures load, hides the dev overlays and the fixed bar (which
 * would otherwise sit over every section shot), then writes one PNG per h2 section plus the full page.
 *
 *   npm run site:sections -- /home-2/ [--url http://localhost:5800] [--widths 1440,400] [--label r1] [--out <dir>]
 *
 * Files: <out>/<label>-<width>-full.png and <out>/<label>-<width>-<n>-<slug>.png, n counting h2s from 0.
 * Unlike site:compare it shoots the dev server, motion and all, as a person scrolling sees it.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseArgs } from 'node:util';

import { launchChromium } from '../utils/browser/launchChromium';
import { BASE } from '../../packages/website/src/data/site';

const HEIGHT_FOR_WIDTH: Record<number, number> = { 1440: 900, 1024: 768, 400: 860 };
// The dev overlay marks all it adds with data-overlay-ui (dev/overlay/overlayUi.ts).
const HIDE =
  '[data-overlay-ui], astro-dev-toolbar, header:has(nav[aria-label="Main"]) { display: none !important; }';
// One scroll step per 0.6 viewport, each long enough for a lazy picture to start and decode.
const STEP_MS = 120;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    url: { type: 'string', default: 'http://localhost:5800' },
    widths: { type: 'string', default: '1440,400' },
    label: { type: 'string', default: 'shot' },
    out: { type: 'string', default: join(tmpdir(), 'site-sections') },
  },
});
const path = positionals[0];
if (!path) throw new Error('Give the page path, such as /home-2/');
mkdirSync(values.out, { recursive: true });

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);

const browser = await launchChromium();
for (const width of values.widths.split(',').map(Number)) {
  const height = HEIGHT_FOR_WIDTH[width] ?? 900;
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(`${values.url}${BASE.replace(/\/$/, '')}${path}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.addStyleTag({ content: HIDE });
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < total; y += Math.round(height * 0.6)) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(STEP_MS);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  await page.screenshot({
    path: join(values.out, `${values.label}-${width}-full.png`),
    fullPage: true,
  });

  // A section is the outermost box between the h2 and <main>, so its whole band is shot. An island
  // wrapper (`astro-island`) is `display: contents` and has no box of its own, so it never counts.
  const sections = await page.$$eval('main h2', (headings) =>
    headings.map((h) => {
      let el: Element = h;
      let band: Element = h;
      while (el.parentElement && el.parentElement.tagName !== 'MAIN') {
        el = el.parentElement;
        if (getComputedStyle(el).display !== 'contents') band = el;
      }
      const box = band.getBoundingClientRect();
      return { text: h.textContent ?? '', y: box.top + window.scrollY, h: box.height };
    }),
  );
  for (const [n, s] of sections.entries()) {
    await page.evaluate((top) => window.scrollTo(0, top), s.y);
    await page.waitForTimeout(400);
    const file = join(values.out, `${values.label}-${width}-${n}-${slug(s.text)}.png`);
    await page.screenshot({
      path: file,
      fullPage: true,
      clip: { x: 0, y: s.y, width, height: Math.max(1, s.h) },
    });
  }
  await page.close();
  console.log(`${width}: full page + ${sections.length} sections → ${values.out}`);
}
await browser.close();
