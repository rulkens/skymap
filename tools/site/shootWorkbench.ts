/**
 * Take the picture of one workbench for the Developer workbenches page, from
 * wherever that workbench is being served, and write it at the page's widths.
 * A workbench is not a view of the app, so it has no row in the shot manifest
 * and no deep link: its address is given by hand.
 *
 *   npx tsx tools/site/shootWorkbench.ts galaxy https://skymap.rulkens.com/galaxy/
 *   npx tsx tools/site/shootWorkbench.ts scene http://localhost:5600/ --settle 25000
 */
import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

import {
  WORKBENCHES,
  WORKBENCH_WIDTHS,
  WORKBENCH_WINDOW,
} from '../../packages/website/src/data/workbenches';
import { launchChromium } from '../utils/browser/launchChromium';

const MASTERS_DIR = 'data/shots/site/workbenches';
const OUT_DIR = 'packages/website/src/assets/workbenches';
// As the app's interface shots: twice the window, AVIF 50 and the WebP quality that matches it.
const DPR = 2;
const AVIF = { quality: 50, effort: 9 };
const WEBP = { quality: 76, effort: 6 };
// A simulation or a streamed scene needs time to show something; a click needs a moment to land.
const DEFAULT_SETTLE_MS = 12000;
const CLICK_SETTLE_MS = 1500;

const [id, url, ...flags] = process.argv.slice(2);
const row = WORKBENCHES.find((workbench) => workbench.id === id);
if (!row || !url) {
  console.error(
    `usage: shootWorkbench <${WORKBENCHES.map((w) => w.id).join('|')}> <address> [--settle ms]`,
  );
  process.exit(1);
}
const settleMs = flags.includes('--settle')
  ? Number(flags[flags.indexOf('--settle') + 1])
  : DEFAULT_SETTLE_MS;

mkdirSync(MASTERS_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });
const master = join(MASTERS_DIR, `${row.id}.png`);
const browser = await launchChromium();
try {
  const context = await browser.newContext({ viewport: WORKBENCH_WINDOW, deviceScaleFactor: DPR });
  const page = await context.newPage();
  await page.goto(url);
  await page.waitForTimeout(settleMs);
  if (row.picture.click) {
    await page.getByText(row.picture.click, { exact: true }).first().click();
    await page.waitForTimeout(CLICK_SETTLE_MS);
  }
  await page.screenshot({ path: master, type: 'png' });
} finally {
  await browser.close();
}
for (const width of WORKBENCH_WIDTHS) {
  const resized = sharp(master).resize({ width, kernel: 'lanczos3' });
  const avif = join(OUT_DIR, `${row.id}-${width}.avif`);
  await resized.clone().avif(AVIF).toFile(avif);
  await resized
    .clone()
    .webp(WEBP)
    .toFile(join(OUT_DIR, `${row.id}-${width}.webp`));
  console.log(`${row.id}-${width}  ${Math.round(statSync(avif).size / 1024)} KB (AVIF)`);
}
