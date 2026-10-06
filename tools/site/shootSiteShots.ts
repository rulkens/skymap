/**
 * Take every picture in the website's shot manifest from a running app and
 * write it at the widths the pages use, AVIF and WebP, into the site's
 * committed assets. `npm run shot` cannot do this alone: a deep link carries no
 * settings, and most rows hide labels or switch a layer.
 *
 *   npm run site:shots -- --url http://localhost:5178 [--only id,id] [--from-masters]
 *
 * The full-size PNG of each row is kept in `data/shots/site/` (gitignored);
 * `--from-masters` re-encodes from those without visiting the app.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

import { SITE_SHOTS } from '../../packages/website/src/data/siteShots';
import type { SkymapWindow } from '../../src/@types/automation/SkymapWindow';
import { bootHookedPage } from '../utils/browser/bootHookedPage';
import { dispatchActions } from '../utils/browser/dispatchActions';
import { launchChromium } from '../utils/browser/launchChromium';
import { warnIfWrongCheckout } from '../utils/browser/warnIfWrongCheckout';
import { readCanvas } from '../utils/shot/readCanvas';
import { makeSiteOgCard } from './utils/makeSiteOgCard';
import { siteShotActions } from './utils/siteShotActions';
import { siteShotUrl } from './utils/siteShotUrl';

const MASTERS_DIR = 'data/shots/site';
const OUT_DIR = 'packages/website/src/assets/shots';
const DPR = 2;
// Measured on these frames: AVIF 50 holds a star field, and WebP needs 76 to match it.
const AVIF = { quality: 50, effort: 9 };
const WEBP = { quality: 76, effort: 6 };

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
        await bootHookedPage(page, siteShotUrl(base!, shot));
        if (warnCheckout) await warnIfWrongCheckout(page);
        warnCheckout = false;
        await dispatchActions(page, siteShotActions(shot));
        const settled = () =>
          page.evaluate(() => (window as unknown as SkymapWindow).__skymap!.settled());
        await settled();
        if (shot.settings?.settleMs) {
          await page.waitForTimeout(shot.settings.settleMs);
          await settled();
        }
        writeFileSync(master, await readCanvas(page, 'png'));
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
    for (const width of shot.widths) {
      const resized = sharp(master).resize({ width, kernel: 'lanczos3' });
      const avif = join(OUT_DIR, `${shot.id}-${width}.avif`);
      await resized.clone().avif(AVIF).toFile(avif);
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
