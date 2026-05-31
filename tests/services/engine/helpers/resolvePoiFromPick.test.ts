import { describe, it, expect } from 'vitest';

import { resolvePoiFromPick } from '../../../../src/services/engine/helpers/resolvePoiFromPick';
import type { PointOfInterest } from '../../../../src/@types/engine/subsystems/PointOfInterest';
import type { PoiCategory } from '../../../../src/services/engine/subsystems/poiSubsystem';

// Minimal POI fixtures.  The helper only reads `id` and `category` of
// the records `getPoisForCategory` hands back (well, it reads nothing
// except identity — the helper just indexes the returned array), so
// each record needs only the fields that satisfy the `PointOfInterest`
// type.
const virgo: PointOfInterest = {
  id: 'virgo-m87',
  name: 'Virgo Cluster',
  category: 'cluster',
  worldPos: [10, 0, 0],
  featured: true,
  physicalRadiusMpc: 2.2,
};
const coma: PointOfInterest = {
  id: 'coma',
  name: 'Coma Cluster',
  category: 'cluster',
  worldPos: [0, 100, 0],
  featured: true,
  physicalRadiusMpc: 6,
};
const bootes: PointOfInterest = {
  id: 'bootes-void',
  name: 'Boötes Void',
  category: 'void',
  worldPos: [0, 0, 100],
  featured: true,
  physicalRadiusMpc: 50,
};

// Minimal subsystem stub mirroring the helper's `SubsystemForPickResolve`
// projection.  Only `getPoisForCategory` is needed.  We branch on the
// category so each test can verify the helper indexes the RIGHT
// per-category bucket — not just "an array of POIs".
const subsystem = {
  getPoisForCategory(category: PoiCategory): readonly PointOfInterest[] {
    if (category === 'cluster') return [virgo, coma];
    if (category === 'void') return [bootes];
    return [];
  },
};

describe('resolvePoiFromPick', () => {
  it('resolves the 0th cluster index to the first POI', () => {
    expect(resolvePoiFromPick(subsystem, { category: 'cluster', poiIndex: 0 })).toBe(virgo);
  });

  it('resolves the 1st cluster index to the second POI', () => {
    expect(resolvePoiFromPick(subsystem, { category: 'cluster', poiIndex: 1 })).toBe(coma);
  });

  it('resolves a void index independently of the cluster bucket', () => {
    // The per-category-local indexing invariant: a `poiIndex` of 0
    // means "the 0th of THIS category", not "the 0th globally".
    expect(resolvePoiFromPick(subsystem, { category: 'void', poiIndex: 0 })).toBe(bootes);
  });

  it('returns null for out-of-bounds indices', () => {
    expect(resolvePoiFromPick(subsystem, { category: 'cluster', poiIndex: 99 })).toBe(null);
  });

  it('returns null for a category with no entries', () => {
    expect(resolvePoiFromPick(subsystem, { category: 'supercluster', poiIndex: 0 })).toBe(null);
  });
});
