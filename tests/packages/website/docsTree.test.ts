/**
 * The docs tree (data/docsTree.ts) is the one list the sidebar, the docs index
 * and the link check read. These hold it to the files: a row marked live with
 * no page behind it would be a dead sidebar link, and a page with no row would
 * be built and reachable from nowhere.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DOCS_GROUP_NAMES } from '../../../packages/website/src/data/docsGroupNames';
import { DOCS_TREE } from '../../../packages/website/src/data/docsTree';

const SITE = resolve(import.meta.dirname, '../../../packages/website/src');
const CONTENT = join(SITE, 'content/docs');

const rows = DOCS_TREE.flatMap((group) =>
  group.pages.map((page, i) => ({ ...page, group: group.name, order: i + 1 })),
);
const files = readdirSync(CONTENT, { recursive: true, encoding: 'utf8' })
  .filter((name) => name.endsWith('.mdx'))
  .map((name) => ({
    path: `/docs/${name.replace(/\.mdx$/, '')}/`,
    front: readFileSync(join(CONTENT, name), 'utf8').split('---')[1]!,
  }));
const field = (front: string, name: string) =>
  front.match(new RegExp(`^${name}: (.*)$`, 'm'))?.[1]?.trim();

describe('docs tree', () => {
  it('has the seven groups in sidebar order, and no path twice', () => {
    expect(DOCS_TREE.map((group) => group.name)).toEqual([...DOCS_GROUP_NAMES]);
    const paths = rows.map((row) => row.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.filter((path) => !/^\/docs\/[a-z0-9/-]+\/$/.test(path))).toEqual([]);
  });

  it('every live row has a page and every page has a live row', () => {
    const live = rows.filter((row) => row.status === 'live').map((row) => row.path);
    expect(files.map((file) => file.path).sort()).toEqual(live.sort());
  });

  it('a page’s title, group and order are its row’s', () => {
    for (const file of files) {
      const row = rows.find((candidate) => candidate.path === file.path)!;
      expect(
        {
          title: field(file.front, 'title'),
          group: field(file.front, 'group'),
          order: Number(field(file.front, 'order')),
        },
        file.path,
      ).toEqual({ title: row.title, group: row.group, order: row.order });
    }
  });

  // A link to a docs path outside the tree could never be built: the link check would only say so after a build.
  it('every docs path the site links to is a row of the tree', () => {
    const known = new Set(['/docs/', ...rows.map((row) => row.path)]);
    const linked = readdirSync(SITE, { recursive: true, encoding: 'utf8' })
      .filter((name) => /\.(astro|ts|mdx)$/.test(name))
      .flatMap((name) =>
        [...readFileSync(join(SITE, name), 'utf8').matchAll(/['"(](\/docs\/[a-z0-9/-]*)/g)].map(
          (match) => match[1]!,
        ),
      );
    expect(linked.length).toBeGreaterThan(20);
    expect([...new Set(linked)].filter((path) => !known.has(path))).toEqual([]);
  });
});
