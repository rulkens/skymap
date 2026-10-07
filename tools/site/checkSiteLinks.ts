/**
 * Internal link check over the built website: every `href`/`src` in
 * `dist/<base>/**.html` must resolve (see resolveSiteLink for the rules), and
 * every link into the app must be a view the app's own parser and tables know.
 * Run after `npm run site:build`; CI does. Exits 1 on any broken link, or on
 * a docs page that is built while its row in the docs tree still says planned.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix, relative, resolve, sep } from 'node:path';

import { distDir } from '../utils/io/distDir';
import { toolPages } from '../utils/io/toolPages';
import { DOCS_TREE } from '../../packages/website/src/data/docsTree';
import { appViewProblem } from './utils/appViewProblem';
import { extractIds } from './utils/extractIds';
import { extractLinks } from './utils/extractLinks';
import { resolveSiteLink } from './utils/resolveSiteLink';

const base = `/${toolPages.website}/`;
const siteDir = resolve(distDir, toolPages.website);
const publicDir = resolve('public');

if (!existsSync(siteDir)) {
  console.error(`No build at ${siteDir}. Run "npm run site:build" first.`);
  process.exit(1);
}

const htmlFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? htmlFiles(path) : path.endsWith('.html') ? [path] : [];
  });

const isFile = (path: string): boolean => existsSync(path) && statSync(path).isFile();
const idCache = new Map<string, ReadonlySet<string>>();
const ctx = {
  base,
  hasBuilt: (rel: string) => isFile(join(siteDir, rel)),
  hasPublic: (rel: string) => isFile(join(publicDir, rel)),
  idsOf: (rel: string) => {
    if (!idCache.has(rel)) idCache.set(rel, extractIds(readFileSync(join(siteDir, rel), 'utf8')));
    return idCache.get(rel)!;
  },
  appProblem: appViewProblem,
  // The only pages a link may point at before they exist: the docs tree's planned rows.
  notYetBuilt: DOCS_TREE.flatMap((group) => group.pages)
    .filter((page) => page.status === 'planned')
    .map((page) => page.path),
};

const failures: string[] = [];
const pending = new Map<string, Set<string>>();
let checked = 0;

for (const file of htmlFiles(siteDir)) {
  const rel = relative(siteDir, file).split(sep).join(posix.sep);
  const pagePath = base + rel.replace(/index\.html$/, '');
  for (const href of extractLinks(readFileSync(file, 'utf8'))) {
    const verdict = resolveSiteLink(pagePath, href, ctx);
    if (verdict.kind === 'skip') continue;
    checked++;
    if (verdict.kind === 'broken') failures.push(`${pagePath}  ${href}  ${verdict.reason}`);
    if (verdict.kind === 'stale-pending') {
      failures.push(
        `${pagePath}  ${href}  ${verdict.path} exists now: set its row to live in packages/website/src/data/docsTree.ts`,
      );
    }
    if (verdict.kind === 'pending')
      pending.set(verdict.path, (pending.get(verdict.path) ?? new Set()).add(pagePath));
  }
}

for (const [path, pages] of pending)
  console.log(`pending  ${path}  linked from ${[...pages].join(', ')}`);
if (failures.length > 0) {
  console.error(
    `\n${failures.length} broken link(s):\n${failures.map((f) => `  ${f}`).join('\n')}`,
  );
  process.exit(1);
}
console.log(`ok  ${checked} internal links checked, ${pending.size} planned page(s) not built yet`);
