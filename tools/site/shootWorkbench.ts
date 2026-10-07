/**
 * Take the picture of one workbench for the Developer workbenches page, from
 * wherever that workbench is being served, and write it at the page's widths.
 * A workbench is not a view of the app, so it has no row in the shot manifest
 * and no deep link: its address and what to do there are given by hand, and
 * the README lists the command each picture was taken with.
 *
 *   npx tsx tools/site/shootWorkbench.ts galaxy https://skymap.rulkens.com/galaxy/
 *   npx tsx tools/site/shootWorkbench.ts flow http://localhost:5300/ --fill intensity=0.6 --wheel=-1800
 *
 * Done in this order: `--dark` (the page is asked for its dark colours),
 * each `--click <name of a tab, button or link>`, each `--fill <control's label>=<value>`,
 * `--wheel=<pixels>` over the window's middle (negative zooms in, and needs
 * the `=`), then the `--settle <ms>` wait.
 * `--quality <n>` is the AVIF quality of the widths above the narrowest;
 * `--from-master` writes the files again from the PNG kept from the last run.
 */
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';

import {
  WORKBENCHES,
  WORKBENCH_WIDTHS,
  WORKBENCH_WINDOW,
} from '../../packages/website/src/data/workbenches';
import { launchChromium } from '../utils/browser/launchChromium';
import { SHOT_ENCODING } from './shotEncoding';

const MASTERS_DIR = 'data/shots/site/workbenches';
const OUT_DIR = 'packages/website/src/assets/workbenches';
// A simulation or a streamed scene needs time to show something.
const DEFAULT_SETTLE_MS = 12000;
// A page that failed to draw is one flat colour: its channels vary by less than this, of 255.
const FLAT_BELOW = 2;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    settle: { type: 'string', default: String(DEFAULT_SETTLE_MS) },
    click: { type: 'string', multiple: true, default: [] },
    fill: { type: 'string', multiple: true, default: [] },
    wheel: { type: 'string' },
    dark: { type: 'boolean', default: false },
    quality: { type: 'string', default: String(SHOT_ENCODING.avif.quality) },
    'from-master': { type: 'boolean', default: false },
  },
});
const [id, url] = positionals;
const row = WORKBENCHES.find((workbench) => workbench.id === id);
const numbers = { settle: Number(values.settle), quality: Number(values.quality) };
if (!row || (!url && !values['from-master']) || Object.values(numbers).some(Number.isNaN)) {
  console.error(
    `usage: shootWorkbench <${WORKBENCHES.map((w) => w.id).join('|')}> <address> [--dark] [--click text] [--fill label=value] [--wheel=px] [--settle ms] [--quality n] | <id> --from-master`,
  );
  process.exit(1);
}

mkdirSync(MASTERS_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });
const master = join(MASTERS_DIR, `${row.id}.png`);
if (!values['from-master']) {
  const browser = await launchChromium();
  try {
    const context = await browser.newContext({
      viewport: WORKBENCH_WINDOW,
      deviceScaleFactor: SHOT_ENCODING.dpr,
      colorScheme: values.dark ? 'dark' : 'light',
    });
    const page = await context.newPage();
    const response = await page.goto(url!);
    // A file:// address has no response to ask.
    if (response && !response.ok()) throw new Error(`${url} answered ${response.status()}`);
    // A control by its name, not the first text that matches: a heading with the same words is not clicked, and a
    // name two controls share stops the run.
    for (const name of values.click) {
      const named = (role: 'tab' | 'button' | 'link') =>
        page.getByRole(role, { name, exact: true });
      await named('tab').or(named('button')).or(named('link')).click();
    }
    for (const pair of values.fill) {
      const [label, value] = pair.split('=');
      await page.getByLabel(label!).fill(value!);
    }
    // The control filled last keeps the keyboard's ring, which is not part of the tool.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    if (values.wheel) {
      await page.mouse.move(WORKBENCH_WINDOW.width / 2, WORKBENCH_WINDOW.height / 2);
      await page.mouse.wheel(0, Number(values.wheel));
    }
    await page.waitForTimeout(numbers.settle);
    await page.screenshot({ path: master, type: 'png' });
  } finally {
    await browser.close();
  }
} else if (!existsSync(master)) {
  throw new Error(`no master at ${master}: take the picture first`);
}
const { channels } = await sharp(master).stats();
if (channels.every((channel) => channel.stdev < FLAT_BELOW))
  throw new Error(`${master} is one flat colour: the page did not draw`);

const narrowest = Math.min(...WORKBENCH_WIDTHS);
for (const width of WORKBENCH_WIDTHS) {
  const resized = sharp(master).resize({ width, kernel: 'lanczos3' });
  const avif = join(OUT_DIR, `${row.id}-${width}.avif`);
  const quality = width > narrowest ? numbers.quality : SHOT_ENCODING.avif.quality;
  await resized
    .clone()
    .avif({ ...SHOT_ENCODING.avif, quality })
    .toFile(avif);
  await resized
    .clone()
    .webp(SHOT_ENCODING.webp)
    .toFile(join(OUT_DIR, `${row.id}-${width}.webp`));
  console.log(`${row.id}-${width}  ${Math.round(statSync(avif).size / 1024)} KB (AVIF)`);
}
