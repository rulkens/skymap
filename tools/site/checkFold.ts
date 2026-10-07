/**
 * First-screen check over a served website: on every page, the opening section
 * (the one element marked `data-opening`) must fit the first screen in each
 * window of foldSizes.ts (see foldVerdict for the rule). Exits 1 on any miss.
 *
 *   npm run site:fold -- --url http://localhost:4321/home/
 *
 * Pages are the files of the site's `pages/` folder and the written pages of
 * the docs tree, so a new page is checked without being listed here.
 */
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { DOCS_TREE } from '../../packages/website/src/data/docsTree';
import { launchChromium } from '../utils/browser/launchChromium';
import type { FoldMeasure } from './@types/FoldMeasure';
import { FOLD_SIZES } from './foldSizes';
import { foldVerdict } from './utils/foldVerdict';

const PAGES_DIR = resolve(import.meta.dirname, '../../packages/website/src/pages');
// Fonts and the first picture decide the layout; the flight on Home never goes network-idle.
const SETTLE_MS = 800;

const args = process.argv.slice(2);
const base = args.includes('--url') ? args[args.indexOf('--url') + 1] : undefined;
if (!base) {
  console.error('usage: npm run site:fold -- --url <website server, with its base path>');
  process.exit(1);
}

// A file with a bracket in its name is a pattern, not a page: the docs pages it makes come from the tree.
const routes = readdirSync(PAGES_DIR, { recursive: true, encoding: 'utf8' })
  .filter((name) => name.endsWith('.astro') && !name.includes('['))
  .map((name) => name.replace(/(index)?\.astro$/, ''))
  .map((name) => (name === '' || name.endsWith('/') ? name : `${name}/`))
  .concat(
    DOCS_TREE.flatMap((group) => group.pages)
      .filter((page) => page.status === 'live')
      .map((page) => page.path.slice(1)),
  );

const failures: string[] = [];
const browser = await launchChromium();
try {
  for (const size of FOLD_SIZES) {
    const context = await browser.newContext({ viewport: size });
    const page = await context.newPage();
    for (const route of routes) {
      await page.goto(`${base.replace(/\/+$/, '')}/${route}`, { waitUntil: 'load' });
      await page.waitForTimeout(SETTLE_MS);
      // No helper function in here: tsx wraps a named one in a call the page does not have.
      const measure = await page.evaluate((): FoldMeasure | null => {
        const opening = document.querySelector('[data-opening]');
        if (!opening) return null;
        return {
          bottom: opening.getBoundingClientRect().bottom,
          titleBottom: opening.querySelector('h1')?.getBoundingClientRect().bottom ?? null,
          leadBottom: opening.querySelector('h1 ~ p')?.getBoundingClientRect().bottom ?? null,
          pictureTop: opening.querySelector('img')?.getBoundingClientRect().top ?? null,
          bodyTop:
            document.querySelector('.doc-body > :not(p)')?.getBoundingClientRect().top ?? null,
        };
      });
      const reason = foldVerdict(measure, size);
      if (reason) failures.push(`${size.width}x${size.height}  /${route}  ${reason}`);
    }
    await context.close();
  }
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error(
    `${failures.length} opening section(s) off the first screen:\n${failures.map((f) => `  ${f}`).join('\n')}`,
  );
  process.exit(1);
}
console.log(`ok  ${routes.length} pages fit the first screen in ${FOLD_SIZES.length} windows`);
