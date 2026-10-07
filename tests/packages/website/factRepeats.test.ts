/**
 * A sourced row printed in full on many pages is one sentence a reader meets
 * again and again. Each row has one page that states it; another page says it
 * in a clause and links there (`<Fact brief>`). Rows reach a page by several
 * roads (a component, a table fed from data, a page's own script), so this
 * reads the built pages: `npm run site:repeats` after `npm run site:build`,
 * as CI does. Without a build there is nothing to read and it is skipped.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { FACTS } from '../../../packages/website/src/data/facts';
import { pageWords } from '../../../tools/site/utils/pageWords';
import { distDir } from '../../../tools/utils/io/distDir';
import { toolPages } from '../../../tools/utils/io/toolPages';

// The worst row on the day this was written. It only ever goes down: lower it when the worst row improves.
const MOST_PAGES = 8;

const siteDir = resolve(distDir, toolPages.website);

const htmlFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? htmlFiles(path) : path.endsWith('.html') ? [path] : [];
  });

describe.skipIf(!existsSync(siteDir))('fact rows on the built pages', () => {
  it(`prints no row in full on more than ${MOST_PAGES} pages`, () => {
    const pages = htmlFiles(siteDir).map((file) => ({
      path: `/${relative(siteDir, file).replace(/index\.html$/, '')}`,
      words: pageWords(readFileSync(file, 'utf8')),
    }));
    const over = FACTS.map((row) => {
      const text = row.text.replace(/\s+/g, ' ').trim();
      const on = pages.filter((page) => page.words.includes(text)).map((page) => page.path);
      return { id: row.id, on };
    })
      .filter((row) => row.on.length > MOST_PAGES)
      .sort((a, b) => b.on.length - a.on.length || a.id.localeCompare(b.id))
      .map((row) => `${row.on.length}  ${row.id}  ${row.on.join(' ')}`);
    expect(over).toEqual([]);
  });
});
