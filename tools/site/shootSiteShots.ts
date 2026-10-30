/**
 * Take every picture in the website's shot manifest from a running app and
 * write it at the widths the pages use, AVIF and WebP, into the site's
 * committed assets. `npm run shot` cannot do this alone: a deep link carries no
 * settings, and most rows hide labels or switch a layer.
 *
 *   npm run site:shots -- --url http://localhost:5178 [--only id,id] [--from-masters]
 *   npm run site:shots -- --url <app> --try '<hash body>' [--settings '<json>'] [--size 1600x1000] [--query dome] [--name n] [--out dir]
 *
 * `--from-masters` re-encodes from the full-size PNGs kept in `data/shots/site/` (gitignored).
 * `--try` takes one framing that is in no row and writes `<out>/<name>.png` (the temp folder by
 * default), as a row with those fields would come out, touching neither manifest nor assets.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import type { SiteShotSettings } from '../../packages/website/src/@types/SiteShotSettings';
import { SITE_SHOTS } from '../../packages/website/src/data/siteShots';
import { launchChromium } from '../utils/browser/launchChromium';
import { warnIfWrongCheckout } from '../utils/browser/warnIfWrongCheckout';
import { SHOT_ENCODING } from './shotEncoding';
import { captureSiteShot } from './utils/captureSiteShot';
import { makeSiteOgCard } from './utils/makeSiteOgCard';
import { openSiteShot } from './utils/openSiteShot';
import { parseSize } from './utils/parseSize';
import { shootMatte } from './utils/shootMatte';
import { shotFrame } from './utils/shotFrame';

const MASTERS_DIR = 'data/shots/site';
const OUT_DIR = 'packages/website/src/assets/shots';
const { dpr: DPR, avif: AVIF, webp: WEBP } = SHOT_ENCODING;

const args = process.argv.slice(2);
const valueOf = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const base = valueOf('--url');
const only = valueOf('--only')?.split(',');
const fromMasters = args.includes('--from-masters');

const tryLink = valueOf('--try');
if (tryLink !== undefined) {
  if (!base) throw new Error('--try needs --url <app server>');
  const settings: SiteShotSettings = JSON.parse(valueOf('--settings') ?? '{}');
  const shot = {
    link: tryLink.replace(/^#/, ''),
    query: valueOf('--query'),
    settings,
    size: parseSize(valueOf('--size') ?? '1600x1000'),
  };
  const outDir = valueOf('--out') ?? join(tmpdir(), 'site-shot-try');
  const file = join(outDir, `${valueOf('--name') ?? 'try'}.png`);
  mkdirSync(outDir, { recursive: true });
  const browser = await launchChromium();
  try {
    const context = await browser.newContext({ viewport: shot.size, deviceScaleFactor: DPR });
    const page = await context.newPage();
    let master: Buffer;
    if (settings.matte) {
      await openSiteShot(page, base, shot);
      master = (await shootMatte(page, shot)).master;
    } else {
      master = await captureSiteShot(page, base, shot);
    }
    await warnIfWrongCheckout(page);
    await shotFrame(master, settings.crop, DPR).png().toFile(file);
  } finally {
    await browser.close();
  }
  console.log(file);
  process.exit(0);
}
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
for (const shot of rows) {
  if (shot.settings?.element && shot.settings.crop) {
    console.error(`${shot.id}: \`element\` and \`crop\` cannot be used together`);
    process.exit(1);
  }
}
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
        // A matte row is drawn twice (black, then white) by shootMatte; every other row is one capture.
        if (shot.settings?.matte) {
          await openSiteShot(page, base!, shot);
          const { master: cutout, shadow } = await shootMatte(page, shot);
          writeFileSync(master, cutout);
          if (shadow) writeFileSync(shadowMaster, shadow);
        } else {
          writeFileSync(master, await captureSiteShot(page, base!, shot));
        }
        if (warnCheckout) await warnIfWrongCheckout(page);
        warnCheckout = false;
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
      const frame = shotFrame(file, shot.settings?.crop, dpr);
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
