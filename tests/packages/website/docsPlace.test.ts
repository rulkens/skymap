import { describe, expect, it } from 'vitest';

import type { DocsGroup } from '../../../packages/website/src/@types/DocsGroup';
import { docsPlace } from '../../../packages/website/src/utils/docsPlace';

const page = (path: string, status: 'live' | 'planned') => ({ title: path, path, status });
const TREE: readonly DocsGroup[] = [
  { name: 'Start', purpose: '', up: '/', pages: [page('/docs/a/', 'live')] },
  {
    name: 'Guide',
    purpose: '',
    up: '/classroom/',
    pages: [
      page('/docs/b/', 'live'),
      page('/docs/c/', 'planned'),
      page('/docs/d/', 'live'),
      page('/docs/e/', 'live'),
    ],
  },
];

describe('docsPlace', () => {
  it('steps over a planned page to the nearest written one', () => {
    const place = docsPlace(TREE, '/docs/d/');
    expect([place.previous?.path, place.next?.path]).toEqual(['/docs/b/', '/docs/e/']);
  });

  it('does not leave the group', () => {
    const place = docsPlace(TREE, '/docs/b/');
    expect(place.group.name).toBe('Guide');
    expect(place.previous).toBeUndefined();
  });

  it('throws for a path with no row', () => {
    expect(() => docsPlace(TREE, '/docs/nowhere/')).toThrow(/nowhere/);
  });
});
