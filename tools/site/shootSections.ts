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
import { openScrolledSitePage } from './utils/openScrolledSitePage';
import { shootPageSections } from './utils/shootPageSections';

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

const browser = await launchChromium();
for (const width of values.widths.split(',').map(Number)) {
  const url = `${values.url}${BASE.replace(/\/$/, '')}${path}`;
  const page = await openScrolledSitePage(browser, url, width);
  const sections = await shootPageSections(page, values.out, `${values.label}-${width}`);
  await page.close();
  console.log(`${width}: full page + ${sections.length} sections → ${values.out}`);
}
await browser.close();
