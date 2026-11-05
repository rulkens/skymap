/**
 * A survey pick crosses the pool: the pick draw stamps a pool-absolute index,
 * the ref carries the catalog ordinal, and the renderer maps between them only
 * while the chunk holds its slot.
 */
import { describe, it, expect } from 'vitest';

import { starCatalogSelectionRow } from '../../../../../src/layers/starCatalog/selection/present/starCatalogSelectionRow';
import { Source } from '../../../../../src/data/source';
import type { StarCatalogRuntime } from '../../../../../src/layers/starCatalog/@types/StarCatalogRuntime';

/** Pool index 7 maps to ordinal 1007 while its chunk is resident; nothing else maps. */
function runtime(resident: boolean): Pick<StarCatalogRuntime, 'renderer' | 'chunkStreams'> {
  return {
    renderer: {
      recordOrdinal: (_source: unknown, poolIndex: number) =>
        resident && poolIndex === 7 ? 1007 : null,
      poolRecordIndex: (_source: unknown, ordinal: number) =>
        resident && ordinal === 1007 ? 7 : null,
    },
    chunkStreams: new Map(),
  } as unknown as Pick<StarCatalogRuntime, 'renderer' | 'chunkStreams'>;
}

const PICK = { sourceCode: Source.GaiaStars, localIdx: 7 };
const REF = { type: 'starCatalog', source: Source.GaiaStars, index: 1007 } as const;

describe('starCatalogSelectionRow', () => {
  it('starCatalogSelectionRow: a pick raced by an eviction resolves to null, never another star', () => {
    expect(starCatalogSelectionRow(runtime(true)).resolvePick(PICK)).toEqual(REF);
    expect(starCatalogSelectionRow(runtime(false)).resolvePick(PICK)).toBeNull();
  });

  it('encodePick returns null for an ordinal whose chunk is not resident', () => {
    expect(starCatalogSelectionRow(runtime(true)).encodePick(REF)).not.toBeNull();
    expect(starCatalogSelectionRow(runtime(false)).encodePick(REF)).toBeNull();
  });
});
