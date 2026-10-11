/**
 * Pages are built from shared components, so a page's own `<style>` block is
 * for what only that page has. This counts its non-blank lines against a
 * per-page allowance. The allowances may only shrink: a new pattern belongs
 * in a component (see components/), and a page with no entry gets none.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const PAGES = resolve(import.meta.dirname, '../../../packages/website/src/pages');

const ALLOWED: Record<string, number> = {
  // The quoted paragraph's measure, and the short column standing on the foot of its row.
  'about.astro': 11,
  // An address inside a sentence that may break anywhere.
  'privacy.astro': 5,
  // Two frames edge to edge, their labels on the page grid either side of the seam.
  'science.astro': 26,
};

const styleLines = (text: string) =>
  [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .flatMap((block) => block[1]!.split('\n'))
    .filter((line) => line.trim() !== '').length;

describe('page-local styles', () => {
  const pages = readdirSync(PAGES, { recursive: true, encoding: 'utf8' }).filter((name) =>
    name.endsWith('.astro'),
  );

  it.each(pages)('%s stays within its allowance', (name) => {
    expect(styleLines(readFileSync(join(PAGES, name), 'utf8'))).toBeLessThanOrEqual(
      ALLOWED[name] ?? 0,
    );
  });

  it('allows nothing for a page that is gone', () => {
    expect(Object.keys(ALLOWED).filter((name) => !pages.includes(name))).toEqual([]);
  });
});
