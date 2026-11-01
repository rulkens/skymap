/**
 * Visual gate for the website: shoots every page of two built `dist/home/`
 * trees at 1440 and 400 px wide and diffs each pair.
 *
 *   npm run site:compare -- --baseline <dir> --current <dir> [--only /docs/] [--out <dir>]
 *
 * Writes report.txt and, for each page that differs at all,
 * <out>/<page>-<width>-{base,cur,diff}.png (default out: the temp folder's
 * `site-compare`). Exits 1 when a page differs in more than
 * RATIO_LIMIT of its pixels, or only one tree has it. Pages are read from the
 * trees' files: the preview build writes no sitemap.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { launchChromium } from '../utils/browser/launchChromium';
import { serveGzipped } from '../utils/serve/serveGzipped';
import type { SiteCompareRow } from './@types/SiteCompareRow';
import { BASE } from '../../packages/website/src/data/site';
import { diffScreenshots } from './utils/diffScreenshots';
import { listSitePages } from './utils/listSitePages';
import { pagesOnOneSide } from './utils/pagesOnOneSide';
import { shootSitePage } from './utils/shootSitePage';

const WIDTHS = [1440, 400];
const RATIO_LIMIT = 0.001;
const PARALLEL = 4;

const args = process.argv.slice(2);
const arg = (name: string): string | undefined =>
  args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const baselineArg = arg('--baseline');
const currentArg = arg('--current');
if (!baselineArg || !currentArg) {
  console.error(
    'usage: npm run site:compare -- --baseline <dir> --current <dir> [--only <path-prefix>] [--out <dir>]',
  );
  process.exit(1);
}
const baselineDir = resolve(baselineArg);
const currentDir = resolve(currentArg);
const only = arg('--only');
const outDir = resolve(arg('--out') ?? join(tmpdir(), 'site-compare'));

const basePages = listSitePages(baselineDir);
const curPages = listSitePages(currentDir);
const lopsided = pagesOnOneSide(basePages, curPages);
const pages = basePages.filter((p) => curPages.includes(p) && (!only || p.startsWith(only)));

// serveGzipped serves a folder at its root; a link named after the site's base path puts each tree under it.
const roots = mkdtempSync(join(tmpdir(), 'site-compare-roots-'));
const mount = (name: string, dir: string): string => {
  const root = join(roots, name);
  const sub = BASE.replaceAll('/', '');
  if (sub === '') {
    symlinkSync(dir, root);
  } else {
    mkdirSync(root);
    symlinkSync(dir, join(root, sub));
  }
  return root;
};
const baselineServer = await serveGzipped(mount('baseline', baselineDir), undefined, 0);
const currentServer = await serveGzipped(mount('current', currentDir), undefined, 0);

mkdirSync(outDir, { recursive: true });
const jobs = pages.flatMap((page) => WIDTHS.map((width) => ({ page, width })));
const rows: SiteCompareRow[] = [];
const browser = await launchChromium();
const started = Date.now();
try {
  const queue = [...jobs];
  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        const route = job.page.slice(1);
        const [base, cur] = await Promise.all([
          shootSitePage(browser, `${baselineServer.url}${BASE}${route}`, job.width),
          shootSitePage(browser, `${currentServer.url}${BASE}${route}`, job.width),
        ]);
        // Identical bytes are the common case; skip decoding two large PNGs to learn it.
        if (base.equals(cur)) {
          rows.push({ page: job.page, width: job.width, changed: 0, ratio: 0 });
          continue;
        }
        const { changed, total, diff } = diffScreenshots(base, cur);
        const slug = `${route.replace(/\/$/, '').replace(/[/.]/g, '-') || 'home'}-${job.width}`;
        writeFileSync(join(outDir, `${slug}-base.png`), base);
        writeFileSync(join(outDir, `${slug}-cur.png`), cur);
        writeFileSync(join(outDir, `${slug}-diff.png`), diff);
        rows.push({ page: job.page, width: job.width, changed, ratio: changed / total });
      }
    }),
  );
} finally {
  await browser.close();
  await Promise.all([baselineServer.close(), currentServer.close()]);
  rmSync(roots, { recursive: true, force: true });
}

rows.sort((a, b) => a.page.localeCompare(b.page) || b.width - a.width);
const over = rows.filter((r) => r.ratio > RATIO_LIMIT);
const line = (r: SiteCompareRow): string =>
  `${r.page.padEnd(48)} ${String(r.width).padStart(5)}  ${String(r.changed).padStart(9)}  ${(r.ratio * 100).toFixed(4)}%${r.ratio > RATIO_LIMIT ? '  OVER' : ''}`;
const table = [
  'page                                             width    changed  ratio',
  ...rows.map(line),
];
writeFileSync(join(outDir, 'report.txt'), `${table.join('\n')}\n`);

const differing = rows.filter((r) => r.changed > 0);
if (differing.length > 0) console.log([table[0], ...differing.map(line)].join('\n'));
for (const side of lopsided) console.error(`ONE SIDE ONLY  ${side}`);
const seconds = Math.round((Date.now() - started) / 1000);
console.log(
  `${pages.length} pages x ${WIDTHS.length} widths in ${seconds}s: ${differing.length} differ, ${over.length} over ${RATIO_LIMIT * 100}%, ${lopsided.length} on one side only. Pictures in ${outDir}`,
);
if (over.length > 0 || lopsided.length > 0) process.exit(1);
