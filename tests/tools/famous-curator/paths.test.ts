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
  curatedDir,
  curatedGalaxyDir,
  curatedTmpDir,
  overrideIndexPath,
  atlasOutputPath,
} from '../../../tools/famous-curator/plugin/paths';

describe('curator paths', () => {
  const root = '/repo';

  it('curatedDir returns public/images/famous-curated under the repo root', () => {
    expect(curatedDir(root)).toBe('/repo/public/images/famous-curated');
  });

  it('curatedGalaxyDir nests the id under curatedDir', () => {
    expect(curatedGalaxyDir(root, 'm31')).toBe('/repo/public/images/famous-curated/m31');
  });

  it('curatedTmpDir nests .tmp under the galaxy dir', () => {
    expect(curatedTmpDir(root, 'm31')).toBe('/repo/public/images/famous-curated/m31/.tmp');
  });

  it('overrideIndexPath resolves to data/famous_curated_overrides.json', () => {
    expect(overrideIndexPath(root)).toBe('/repo/data/famous_curated_overrides.json');
  });

  it('atlasOutputPath returns the existing atlas slot path', () => {
    // This is the file fetchFamousImages.ts already writes to.  Plan D
    // uses this path to copy curated atlas.webp into place.
    expect(atlasOutputPath(root, 'm31')).toBe('/repo/public/images/famous/m31.webp');
  });
});
