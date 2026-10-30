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
import { SHOT_ENCODING } from './shotEncoding';
import { makeSiteOgCard } from './utils/makeSiteOgCard';
import { openSiteShot } from './utils/openSiteShot';
import { shootMatte } from './utils/shootMatte';
import { shootPairedRemote } from './utils/shootPairedRemote';

const MASTERS_DIR = 'data/shots/site';
const OUT_DIR = 'packages/website/src/assets/shots';
const { dpr: DPR, avif: AVIF, webp: WEBP } = SHOT_ENCODING;
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
    const shadowMaster = join(MASTERS_DIR, `${shot.id}-shadow.png`);
    const dpr = shot.dpr ?? DPR;
    if (!fromMasters) {
      const context = await browser.newContext({ viewport: shot.size, deviceScaleFactor: dpr });
      try {
        const page = await context.newPage();
        await openSiteShot(page, base!, shot);
        if (warnCheckout) await warnIfWrongCheckout(page);
        warnCheckout = false;
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
        if (shot.settings?.remote) {
          writeFileSync(master, await shootPairedRemote(page, base!, shot));
        } else if (shot.settings?.matte) {
          const { master: cutout, shadow } = await shootMatte(page, shot);
          writeFileSync(master, cutout);
          if (shadow) writeFileSync(shadowMaster, shadow);
        } else {
          writeFileSync(
            master,
            shot.settings?.ui
              ? await page.screenshot({ type: 'png' })
              : await readCanvas(page, 'png'),
          );
        }
      } catch (err) {
        failed = true;
        console.error(`${shot.id}: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      } finally {
        await context.close();
      }
    }
    if (!existsSync(master) || (shot.settings?.shadow && !existsSync(shadowMaster))) {
      failed = true;
      console.error(`${shot.id}: no master at ${master}; run with --url first`);
      continue;
    }
    // A `shadow` row's multiply layer is written beside its cut-out, at the same widths.
    const outputs: [string, string][] = [[shot.id, master]];
    if (shot.settings?.shadow) outputs.push([`${shot.id}-shadow`, shadowMaster]);
    for (const [name, file] of outputs) {
      // A row whose widths changed must not leave its old files behind.
      for (const old of readdirSync(OUT_DIR)) {
        if (/^(.+)-\d+\.(avif|webp)$/.exec(old)?.[1] === name) rmSync(join(OUT_DIR, old));
      }
      const sizes: string[] = [];
      const crop = shot.settings?.crop;
      const frame = crop
        ? sharp(file).extract({
            left: crop.left * dpr,
            top: crop.top * dpr,
            width: crop.width * dpr,
            height: crop.height * dpr,
          })
        : sharp(file);
      const narrowest = Math.min(...shot.widths);
      for (const width of shot.widths) {
        const resized = frame.clone().resize({ width, kernel: 'lanczos3' });
        const avif = join(OUT_DIR, `${name}-${width}.avif`);
        const quality = width > narrowest ? (shot.denseQuality ?? AVIF.quality) : AVIF.quality;
        await resized
          .clone()
          .avif({ ...AVIF, quality })
          .toFile(avif);
        await resized
          .clone()
          .webp(WEBP)
          .toFile(join(OUT_DIR, `${name}-${width}.webp`));
        sizes.push(`${width}: ${Math.round(statSync(avif).size / 1024)} KB`);
      }
      console.log(`${name}  ${sizes.join(' · ')} (AVIF)`);
    }
  }
  await makeSiteOgCard(browser, MASTERS_DIR);
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
