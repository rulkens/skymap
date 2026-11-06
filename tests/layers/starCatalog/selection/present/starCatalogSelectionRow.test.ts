/**
 * A survey pick crosses the pool: the pick draw stamps a pool-absolute index,
 * the ref carries the catalog ordinal, and the renderer maps between them only
 * while the chunk holds its slot.
 */
import { describe, it, expect } from 'vitest';

import { starCatalogSelectionRow } from '../../../../../src/layers/starCatalog/selection/present/starCatalogSelectionRow';
import { Source } from '../../../../../src/data/source';
import { unpackPick } from '../../../../../src/data/selectionEncoding';
import { type StarRowFixture } from '../../../../support/selectionResolverOver';
import { starRowRuntime } from '../../../../support/layerPickCodes';
import { fakePickCode } from '../../../../support/fakePickCode';
import { SEEDED_STAR_CATALOGS_BY_SOURCE } from '../../../../../src/data/bodies/seededStarCatalogsBySource';
import type { FamousStarMetaEntry } from '../../../../../src/@types/loading/FamousStarMetaEntry';

/**
 * Pool index 7 maps to ordinal 1007 while its chunk is resident; nothing else
 * maps. Codes from 40 up, so a row that packs a `Source` value fails.
 */
function runtime(resident: boolean) {
  const stars = {
    renderer: {
      recordOrdinal: (_source: unknown, poolIndex: number) =>
        resident && poolIndex === 7 ? 1007 : null,
      poolRecordIndex: (_source: unknown, ordinal: number) =>
        resident && ordinal === 1007 ? 7 : null,
    },
    chunkStreams: new Map(),
  } as unknown as StarRowFixture;
  return starRowRuntime(stars, fakePickCode());
}

const GAIA_CODE = runtime(true).pickCodes.pickCodeOf(Source.GaiaStars);
const PICK = { sourceCode: GAIA_CODE, localIdx: 7 };
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

  it('seeded and survey refs round-trip under non-Source codes', () => {
    const row = starCatalogSelectionRow(runtime(true));
    for (const ref of [
      REF,
      { type: 'starCatalog', source: Source.FamousStar, index: 3 },
      { type: 'starCatalog', source: Source.SStar, index: 2 },
    ] as const) {
      const pick = unpackPick(row.encodePick(ref)!)!;
      expect(pick.sourceCode).toBeGreaterThanOrEqual(40);
      expect(row.resolvePick(pick)).toEqual(ref);
    }
  });

  it('a seeded star joins its curated sidecar entry; a star the sidecar omits carries none', () => {
    const [curated, omitted] = SEEDED_STAR_CATALOGS_BY_SOURCE.get(Source.FamousStar)!.stars;
    const entry = { id: curated!.id, names: ['Curated'] } as unknown as FamousStarMetaEntry;
    const row = starCatalogSelectionRow(
      starRowRuntime({ renderer: null as never, chunkStreams: new Map() }, undefined, [entry]),
    );
    const ref = (index: number) =>
      ({ type: 'starCatalog', source: Source.FamousStar, index }) as const;
    expect(row.extractRow(ref(0), 0)).toMatchObject({ id: curated!.id, famous: entry });
    const bare = row.extractRow(ref(1), 0)!;
    expect(bare).toMatchObject({ id: omitted!.id });
    expect('famous' in bare).toBe(false);
  });
});
