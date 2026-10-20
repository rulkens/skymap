/**
 * The Features page's rows against the docs and the media manifests. A feature
 * whose link names a page or a heading that has since been renamed would send
 * a reader to the top of the wrong text, and a picture or film id that is not
 * in its manifest fails the build with no word of which group asked for it.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import GithubSlugger from 'github-slugger';
import { describe, expect, it } from 'vitest';

import { DOCS_TREE } from '../../../packages/website/src/data/docsTree';
import { FEATURE_GROUPS } from '../../../packages/website/src/data/features';
import { SITE_LOOPS } from '../../../packages/website/src/data/siteLoops';
import { SITE_SHOTS } from '../../../packages/website/src/data/siteShots';

const DOCS = resolve(import.meta.dirname, '../../../packages/website/src/content/docs');
const livePages = new Set(
  DOCS_TREE.flatMap((group) => group.pages)
    .filter((page) => page.status === 'live')
    .map((page) => page.path),
);
const shotIds = new Set(SITE_SHOTS.map((shot) => shot.id));

/** The anchors of a docs page's headings, as the site's Markdown gives them. */
const anchorsOf = (path: string): Set<string> => {
  const text = readFileSync(resolve(DOCS, `${path.slice('/docs/'.length, -1)}.mdx`), 'utf8');
  const slugger = new GithubSlugger();
  return new Set(
    [...text.matchAll(/^#{2,3} (.+)$/gm)].map((heading) => slugger.slug(heading[1]!.trim())),
  );
};

it('group ids are unique', () => {
  const ids = FEATURE_GROUPS.map((group) => group.id);
  expect(new Set(ids).size).toBe(ids.length);
});

describe.each(FEATURE_GROUPS)('feature group $id', (group) => {
  it('every feature links to a live docs page, and to a heading that page has', () => {
    for (const item of group.items) {
      const [path, anchor] = item.doc.split('#') as [string, string | undefined];
      expect(livePages.has(path), `${item.name}: ${path}`).toBe(true);
      if (anchor !== undefined)
        expect([...anchorsOf(path)], `${item.name}: ${item.doc}`).toContain(anchor);
    }
  });

  it('its picture, its upright cut and its film are in their manifests', () => {
    for (const id of [group.shot, group.tall]) {
      if (id !== undefined) expect(shotIds.has(id), id).toBe(true);
    }
    if (group.film !== undefined) {
      expect(
        SITE_LOOPS.some((loop) => loop.id === group.film),
        group.film,
      ).toBe(true);
      expect(group.filmSays, `${group.id} has a film with no words`).toBeTruthy();
    }
  });
});
