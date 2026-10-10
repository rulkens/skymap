/**
 * The docs tree (data/docsTree.ts) is the one list the sidebar, the docs index
 * and the link check read. This holds it to the files: a row marked live with
 * no page behind it would be a dead sidebar link, and a page with no row would
 * fail its build with no word of why.
 */
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DOCS_TREE } from '../../../packages/website/src/data/docsTree';

const SITE = resolve(import.meta.dirname, '../../../packages/website/src');
const rows = DOCS_TREE.flatMap((group) => group.pages);
/** Site paths of the files under a folder that end in `ext`, less the routes that are not one page (a name in brackets makes many). */
const pagesIn = (folder: string, ext: string) =>
  readdirSync(resolve(SITE, folder), { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith(ext) && name !== `index${ext}` && !name.includes('['))
    .map((name) => `/docs/${name.slice(0, -ext.length)}/`.replace(/\/index\/$/, '/'));

describe('docs tree', () => {
  it('has no path twice', () => {
    const paths = rows.map((row) => row.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.filter((path) => !/^\/docs\/[a-z0-9/-]+\/$/.test(path))).toEqual([]);
  });

  // A page is a text in the docs collection, or a page file of its own where it is made from data.
  it('every live row has a page and every page has a live row', () => {
    // The data sources' rows are made from the record, not from files: tests/packages/website/dataPages.test.ts.
    const live = rows.filter((row) => row.status === 'live' && !row.family).map((row) => row.path);
    expect([...pagesIn('content/docs', '.mdx'), ...pagesIn('pages/docs', '.astro')].sort()).toEqual(
      live.sort(),
    );
  });
});
