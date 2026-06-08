import { describe, it, expect } from 'vitest';

import { resolvePoiFromPick } from '../../../../src/services/engine/helpers/resolvePoiFromPick';
import type { StructureRecord } from '../../../../src/@types/engine/data/StructureRecord';
import type { StructureCategory } from '../../../../src/@types/engine/data/StructureCategory';

// Minimal structure fixtures.  The helper only indexes the returned array by
// identity, so each record needs only the fields that satisfy `StructureRecord`.
const virgo: StructureRecord = {
  id: 'virgo-m87',
  name: 'Virgo Cluster',
  category: 'cluster',
  worldPos: [10, 0, 0],
  featured: true,
  physicalRadiusMpc: 2.2,
};
const coma: StructureRecord = {
  id: 'coma',
  name: 'Coma Cluster',
  category: 'cluster',
  worldPos: [0, 100, 0],
  featured: true,
  physicalRadiusMpc: 6,
};
const bootes: StructureRecord = {
  id: 'bootes-void',
  name: 'Boötes Void',
  category: 'void',
  worldPos: [0, 0, 100],
  featured: true,
  physicalRadiusMpc: 50,
};

// Minimal store stub mirroring the helper's `StoreForPickResolve` projection.
// Only `byCategory` is needed.  We branch on the category so each test can
// verify the helper indexes the RIGHT per-category bucket.
const structures = {
  byCategory(category: StructureCategory): readonly StructureRecord[] {
    if (category === 'cluster') return [virgo, coma];
    if (category === 'void') return [bootes];
    return [];
  },
};

describe('resolvePoiFromPick', () => {
  it('resolves the 0th cluster index to the first record', () => {
    expect(resolvePoiFromPick(structures, { category: 'cluster', poiIndex: 0 })).toBe(virgo);
  });

  it('resolves the 1st cluster index to the second record', () => {
    expect(resolvePoiFromPick(structures, { category: 'cluster', poiIndex: 1 })).toBe(coma);
  });

  it('resolves a void index independently of the cluster bucket', () => {
    // The per-category-local indexing invariant: a `poiIndex` of 0
    // means "the 0th of THIS category", not "the 0th globally".
    expect(resolvePoiFromPick(structures, { category: 'void', poiIndex: 0 })).toBe(bootes);
  });

  it('returns null for out-of-bounds indices', () => {
    expect(resolvePoiFromPick(structures, { category: 'cluster', poiIndex: 99 })).toBe(null);
  });

  it('returns null for a category with no entries', () => {
    expect(resolvePoiFromPick(structures, { category: 'supercluster', poiIndex: 0 })).toBe(null);
  });
});
