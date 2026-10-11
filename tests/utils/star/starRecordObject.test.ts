import { describe, it, expect } from 'vitest';

import { starRecordObject } from '../../../src/utils/star/starRecordObject';
import { starRecordOrdinal } from '../../../src/utils/star/starRecordOrdinal';
import type { StarOctree } from '../../../src/@types/data/starCatalog/StarOctree';
import type { StarRecordObject } from '../../../src/@types/data/starCatalog/StarRecordObject';

// 100 index records; chunk 0 holds 50, chunk 1 none, chunk 2 holds 250.
const OCTREE = { recordOrdinalBase: Uint32Array.of(100, 150, 150, 400) } as unknown as StarOctree;

describe('starRecordObject', () => {
  it('starRecordObject ↔ starRecordOrdinal round-trip across the index and every chunk boundary', () => {
    const expected: [number, StarRecordObject][] = [
      [0, { chunk: null, local: 0 }],
      [99, { chunk: null, local: 99 }],
      [100, { chunk: 0, local: 0 }],
      [149, { chunk: 0, local: 49 }],
      [150, { chunk: 2, local: 0 }],
      [399, { chunk: 2, local: 249 }],
    ];
    for (const [ordinal, object] of expected) {
      expect(starRecordObject(OCTREE, ordinal)).toEqual(object);
      expect(starRecordOrdinal(OCTREE, object.chunk, object.local)).toBe(ordinal);
    }
    expect(starRecordObject(OCTREE, 400)).toBeNull();
  });
});
