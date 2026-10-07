/**
 * Take every picture in the website's shot manifest from a running app and
 * write it at the widths the pages use, AVIF and WebP, into the site's
 * committed assets. `npm run shot` cannot do this alone: a deep link carries no
 * settings, and most rows hide labels or switch a layer.
 *
 *   npm run site:shots -- --url http://localhost:5178 [--only id,id] [--from-masters]
 *
 * `--from-masters` re-encodes from the full-size PNGs kept in `data/shots/site/` (gitignored).
 */
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

import { SITE_SHOTS } from '../../packages/website/src/data/siteShots';
import { launchChromium } from '../utils/browser/launchChromium';
import { warnIfWrongCheckout } from '../utils/browser/warnIfWrongCheckout';
import { readCanvas } from '../utils/shot/readCanvas';
import { makeSiteOgCard } from './utils/makeSiteOgCard';
import { openSiteShot } from './utils/openSiteShot';

const MASTERS_DIR = 'data/shots/site';
const OUT_DIR = 'packages/website/src/assets/shots';
const DPR = 2;
// Measured on these frames: AVIF 50 holds a star field, and WebP needs 76 to match it.
const AVIF = { quality: 50, effort: 9 };
const WEBP = { quality: 76, effort: 6 };
// Typed as a person types, then long enough for the palette's results to land.
const KEY_DELAY_MS = 60;
const RESULTS_SETTLE_MS = 1200;
// A panel section unfolds over a short transition.
const PANEL_SETTLE_MS = 600;

const args = process.argv.slice(2);
const valueOf = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const base = valueOf('--url');
const only = valueOf('--only')?.split(',');
const fromMasters = args.includes('--from-masters');
if (!base && !fromMasters) {
  console.error('usage: npm run site:shots -- --url <app server> [--only id,id] [--from-masters]');
  process.exit(1);
}
const unknown = only?.filter((id) => !SITE_SHOTS.some((shot) => shot.id === id)) ?? [];
if (unknown.length > 0) {
  console.error(`not in the manifest: ${unknown.join(', ')}`);
  process.exit(1);
}

mkdirSync(MASTERS_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });
const rows = SITE_SHOTS.filter((shot) => !only || only.includes(shot.id));
// `--from-masters` still needs the browser: it sets the card's type.
const browser = await launchChromium();
let warnCheckout = true;
let failed = false;
try {
  for (const shot of rows) {
    const master = join(MASTERS_DIR, `${shot.id}.png`);
    if (!fromMasters) {
      const context = await browser.newContext({ viewport: shot.size, deviceScaleFactor: DPR });
      try {
        const page = await context.newPage();
        await openSiteShot(page, base!, shot);
        if (warnCheckout) await warnIfWrongCheckout(page);
        warnCheckout = false;
        if (shot.settings?.searchFor !== undefined) {
          await page.keyboard.press('/');
          await page.keyboard.type(shot.settings.searchFor, { delay: KEY_DELAY_MS });
          await page.waitForTimeout(RESULTS_SETTLE_MS);
        }
        for (const heading of shot.settings?.open ?? []) {
          // The heading's own text, not the button's name: a heading with a switch is named after both.
          await page.locator('button', { has: page.locator(`span:text-is("${heading}")`) }).click();
          await page.waitForTimeout(PANEL_SETTLE_MS);
        }
        // A `ui` shot is the page as a visitor sees it; the rest are the canvas alone.
        writeFileSync(
          master,
          shot.settings?.ui
            ? await page.screenshot({ type: 'png' })
            : await readCanvas(page, 'png'),
        );
      } catch (err) {
        failed = true;
        console.error(`${shot.id}: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      } finally {
        await context.close();
      }
    }
    if (!existsSync(master)) {
      failed = true;
      console.error(`${shot.id}: no master at ${master}; run with --url first`);
      continue;
    }
    // A row whose widths changed must not leave its old files behind.
    for (const file of readdirSync(OUT_DIR)) {
      if (/^(.+)-\d+\.(avif|webp)$/.exec(file)?.[1] === shot.id) rmSync(join(OUT_DIR, file));
    }
    const sizes: string[] = [];
    const crop = shot.settings?.crop;
    const frame = crop
      ? sharp(master).extract({
          left: crop.left * DPR,
          top: crop.top * DPR,
          width: crop.width * DPR,
          height: crop.height * DPR,
        })
      : sharp(master);
    const narrowest = Math.min(...shot.widths);
    for (const width of shot.widths) {
      const resized = frame.clone().resize({ width, kernel: 'lanczos3' });
      const avif = join(OUT_DIR, `${shot.id}-${width}.avif`);
      const quality = width > narrowest ? (shot.denseQuality ?? AVIF.quality) : AVIF.quality;
      await resized
        .clone()
        .avif({ ...AVIF, quality })
        .toFile(avif);
      await resized
        .clone()
        .webp(WEBP)
        .toFile(join(OUT_DIR, `${shot.id}-${width}.webp`));
      sizes.push(`${width}: ${Math.round(statSync(avif).size / 1024)} KB`);
    }
    console.log(`${shot.id}  ${sizes.join(' · ')} (AVIF)`);
  }
  await makeSiteOgCard(browser, MASTERS_DIR);
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
