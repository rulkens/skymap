/**
 * paths — pure helpers for resolving curator file locations.
 *
 * All helpers take an explicit `repoRoot` argument so tests can drive
 * them with a fixture directory.  Production callers pass
 * `findRepoRoot()` (which walks up from a known marker like
 * package.json), keeping I/O at the edge.
 */
import { describe, expect, it } from 'vitest';
import {
  overrideIndexPath,
  atlasOutputPath,
} from '../../../tools/famous-curator/plugin/paths';

describe('curator paths', () => {
  const root = '/repo';

  it('overrideIndexPath resolves to data/seeds/famous_curated_overrides.json', () => {
    expect(overrideIndexPath(root)).toBe('/repo/data/seeds/famous_curated_overrides.json');
  });

  it('atlasOutputPath returns the existing atlas slot path', () => {
    // This is the file fetchFamousImages.ts already writes to.  Plan D
    // uses this path to copy curated atlas.webp into place.
    expect(atlasOutputPath(root, 'm31')).toBe('/repo/public/images/famous/m31.webp');
  });
});
