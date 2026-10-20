import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { listSitePages } from '../../../tools/site/utils/listSitePages';
import { pagesOnOneSide } from '../../../tools/site/utils/pagesOnOneSide';

function tree(pages: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'compare-site-'));
  for (const page of pages) {
    mkdirSync(join(dir, page, '..'), { recursive: true });
    writeFileSync(join(dir, page), '<html></html>');
  }
  return dir;
}

describe('compareSite', () => {
  it('flags a page present on one side only', () => {
    const baseline = listSitePages(
      tree(['index.html', '404.html', 'about/index.html', 'docs/a/index.html']),
    );
    const current = listSitePages(
      tree(['index.html', '404.html', 'about/index.html', 'features/index.html']),
    );

    expect(pagesOnOneSide(baseline, current)).toEqual([
      '/docs/a/  only in baseline',
      '/features/  only in current',
    ]);
  });

  it('reads pages from the files, leaving out the search index and the assets', () => {
    const pages = listSitePages(
      tree(['index.html', 'pagefind/fragment/index.html', '_astro/x.html', 'about/index.html']),
    );
    expect(pages).toEqual(['/', '/about/']);
  });
});
