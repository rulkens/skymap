/**
 * Drift check between each landing page's `<page>.structure.yaml` and its built HTML: every h2/h3
 * inside `<main>` must be named in the file and every heading the file names must be on the page
 * (see structureDrift). Run after `npm run site:build`. Exits 1 on any drift or a missing build.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parse } from 'yaml';

import { distDir } from '../utils/io/distDir';
import { toolPages } from '../utils/io/toolPages';
import type { PageStructure } from '../../packages/website/src/@types/PageStructure';
import { mainHeadings } from './utils/mainHeadings';
import { structureDrift } from './utils/structureDrift';

const PAGES = ['home', 'features', 'classroom', 'domes', 'science', 'about', 'privacy', '404'];
const siteDir = resolve(distDir, toolPages.website);
const pagesDir = resolve(import.meta.dirname, '../../packages/website/src/content/pages');

// Home is the site root, 404 is a lone file; every other page is a folder with an index.
const builtFile = (page: string): string =>
  page === 'home' ? 'index.html' : page === '404' ? '404.html' : `${page}/index.html`;

const failures: string[] = [];
let checked = 0;

for (const page of PAGES) {
  const yamlPath = resolve(pagesDir, page, `${page}.structure.yaml`);
  const htmlPath = resolve(siteDir, builtFile(page));
  if (!existsSync(htmlPath)) {
    failures.push(`${page}: no build at ${htmlPath}; run "npm run site:build" first`);
    continue;
  }
  const structure = parse(readFileSync(yamlPath, 'utf8')) as PageStructure;
  const { h2, h3 } = mainHeadings(readFileSync(htmlPath, 'utf8'));
  checked++;
  for (const problem of structureDrift(structure, h2, h3)) failures.push(`${page}: ${problem}`);
}

if (failures.length > 0) {
  console.error(
    `\n${failures.length} structure problem(s):\n${failures.map((f) => `  ${f}`).join('\n')}`,
  );
  process.exit(1);
}
console.log(`ok  ${checked} page structure file(s) match their built pages`);
