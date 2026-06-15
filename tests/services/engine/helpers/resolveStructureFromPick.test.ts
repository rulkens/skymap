import { describe, it, expect } from 'vitest';

import { resolveStructureFromPick } from '../../../../src/services/engine/helpers/resolveStructureFromPick';
import type { StructureRecord } from '../../../../src/@types/data/structure/StructureRecord';
import type { StructureCategory } from '../../../../src/@types/data/structure/StructureCategory';

// Minimal structure fixtures.  The helper only indexes the returned array by
// identity, so each record needs only the fields that satisfy `StructureRecord`.
const virgo: StructureRecord = {
  type: 'structure',
  id: 'virgo-m87',
  name: 'Virgo Cluster',
  category: 'cluster',
  worldPos: [10, 0, 0],
  featured: true,
  physicalRadiusMpc: 2.2,
};
const coma: StructureRecord = {
  type: 'structure',
  id: 'coma',
  name: 'Coma Cluster',
  category: 'cluster',
  worldPos: [0, 100, 0],
  featured: true,
  physicalRadiusMpc: 6,
};
const bootes: StructureRecord = {
  type: 'structure',
  id: 'bootes-void',
  name: 'Boötes Void',
  category: 'void',
  worldPos: [0, 0, 100],
  featured: true,
  physicalRadiusMpc: 50,
};

// Minimal store stub mirroring the helper's `PickStructureStore` projection.
// Only `byCategory` is needed.  We branch on the category so each test can
// verify the helper indexes the RIGHT per-category bucket.
const structures = {
  byCategory(category: StructureCategory): readonly StructureRecord[] {
    if (category === 'cluster') return [virgo, coma];
    if (category === 'void') return [bootes];
    return [];
  },
};

describe('resolveStructureFromPick', () => {
  it('resolves the 0th cluster index to the first record', () => {
    expect(resolveStructureFromPick(structures, { category: 'cluster', structureIndex: 0 })).toBe(
      virgo,
    );
  });

  it('resolves the 1st cluster index to the second record', () => {
    expect(resolveStructureFromPick(structures, { category: 'cluster', structureIndex: 1 })).toBe(
      coma,
    );
  });

  it('resolves a void index independently of the cluster bucket', () => {
    // The per-category-local indexing invariant: a `structureIndex` of 0
    // means "the 0th of THIS category", not "the 0th globally".
    expect(resolveStructureFromPick(structures, { category: 'void', structureIndex: 0 })).toBe(
      bootes,
    );
  });

  it('returns null for out-of-bounds indices', () => {
    expect(resolveStructureFromPick(structures, { category: 'cluster', structureIndex: 99 })).toBe(
      null,
    );
  });

  it('returns null for a category with no entries', () => {
    expect(
      resolveStructureFromPick(structures, { category: 'supercluster', structureIndex: 0 }),
    ).toBe(null);
  });
});
