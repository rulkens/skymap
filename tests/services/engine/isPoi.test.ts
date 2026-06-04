/**
 * isPoi — type predicate distinguishing StructureRecord from GalaxyInfo
 * inside a FocusableTarget union.
 *
 * The discriminant is the top-level `category` field, which StructureRecord
 * carries but GalaxyInfo doesn't.  GalaxyInfo *does* have a nested
 * `galaxyType.category`, but the predicate checks the top-level key only —
 * structural type-checking would otherwise widen GalaxyInfo into the POI
 * branch and break the dispatcher.
 */
import { describe, it, expect } from 'vitest';
import { isPoi } from '../../../src/services/engine/isPoi';
import type { GalaxyInfo } from '../../../src/@types/engine/GalaxyInfo';
import type { StructureRecord } from '../../../src/@types/engine/data/StructureRecord';

describe('isPoi', () => {
  it('returns true for a StructureRecord', () => {
    const poi: StructureRecord = {
      id: 'virgo-cluster',
      name: 'Virgo Cluster',
      category: 'cluster',
      worldPos: [0, 0, 0],
      featured: true,
      physicalRadiusMpc: 2,
    };
    expect(isPoi(poi)).toBe(true);
  });

  it('returns false for a GalaxyInfo-shaped object (no top-level category)', () => {
    const fakeGalaxy = {
      index: 0,
      x: 1,
      y: 2,
      z: 3,
      galaxyType: { category: 'spiral' },
    } as unknown as GalaxyInfo;
    expect(isPoi(fakeGalaxy)).toBe(false);
  });
});
