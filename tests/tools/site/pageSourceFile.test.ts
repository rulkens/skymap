/**
 * The page path comes off a query string and becomes a file the dev server writes, so the mapping
 * must stay inside the content folder and name only texts, never a route made from data.
 */
import { describe, expect, it } from 'vitest';

import { pageSourceFile } from '../../../tools/site/utils/pageSourceFile';

describe('pageSourceFile', () => {
  it('maps a docs page to its text', () => {
    expect(pageSourceFile('/docs/start/scene/')).toBe('docs/start/scene.mdx');
  });

  it('maps a landing page and home to the pages collection', () => {
    expect(pageSourceFile('/features/')).toBe('pages/features.mdx');
    expect(pageSourceFile('/')).toBe('pages/index.mdx');
  });

  it('refuses a path that climbs out', () => {
    expect(pageSourceFile('/docs/../../etc/')).toBeNull();
    expect(pageSourceFile('/..%2f/')).toBeNull();
  });

  it('names no text for the docs index or a path deeper than a landing page', () => {
    expect(pageSourceFile('/docs/')).toBeNull();
    expect(pageSourceFile('/a/b/')).toBeNull();
  });
});
