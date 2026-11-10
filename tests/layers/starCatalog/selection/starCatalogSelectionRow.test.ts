/**
 * A survey pick crosses the pool: the pick draw stamps a pool-absolute index,
 * the ref carries the catalog ordinal, and the renderer maps between them only
 * while the chunk holds its slot.
 */
import { describe, it, expect } from 'vitest';

import { starCatalogSelectionRow } from '../../../../src/layers/starCatalog/selection/starCatalogSelectionRow';
import { unpackPick } from '../../../../src/data/selectionEncoding';
import { type StarRowFixture } from '../../../support/selectionResolverOver';
import { starRowRuntime } from '../../../support/layerPickCodes';
import { fakePickCode } from '../../../support/fakePickCode';
import { SEEDED_STAR_CATALOGS_BY_SOURCE } from '../../../../src/layers/starCatalog/seededStars/data/seededStarCatalogsBySource';
import { relErr } from '../../../support/relErr';
import type { PlacedRow } from '../../../../src/@types/engine/selection/PlacedRow';

/**
 * Pool index 7 maps to ordinal 1007 while its chunk is resident; nothing else
 * maps. Codes from 40 up, so a row that skips `pickCode` fails.
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

const GAIA_CODE = runtime(true).pickCodes.pickCodeOf('gaiaStars');
const PICK = { sourceCode: GAIA_CODE, localIdx: 7 };
const REF = { type: 'starCatalog', source: 'gaiaStars', index: 1007 } as const;

describe('starCatalogSelectionRow', () => {
  it('starCatalogSelectionRow: a pick raced by an eviction resolves to null, never another star', () => {
    expect(starCatalogSelectionRow(runtime(true)).resolvePick(PICK)).toEqual(REF);
    expect(starCatalogSelectionRow(runtime(false)).resolvePick(PICK)).toBeNull();
  });

  it('encodePick returns null for an ordinal whose chunk is not resident', () => {
    expect(starCatalogSelectionRow(runtime(true)).encodePick(REF)).not.toBeNull();
    expect(starCatalogSelectionRow(runtime(false)).encodePick(REF)).toBeNull();
  });

  it('seeded and survey refs round-trip under allocator codes', () => {
    const row = starCatalogSelectionRow(runtime(true));
    for (const ref of [
      REF,
      { type: 'starCatalog', source: 'famousStar', index: 3 },
      { type: 'starCatalog', source: 'sStar', index: 2 },
    ] as const) {
      const pick = unpackPick(row.encodePick(ref)!)!;
      expect(pick.sourceCode).toBeGreaterThanOrEqual(40);
      expect(row.resolvePick(pick)).toEqual(ref);
    }
  });

  it('places Alpha Centauri at its photosphere radius, in Mpc', () => {
    const stars = SEEDED_STAR_CATALOGS_BY_SOURCE.get('famousStar')!.stars;
    const index = stars.findIndex((star) => star.id === 'alpha-centauri');
    const row = starCatalogSelectionRow(
      starRowRuntime({ renderer: null as never, chunkStreams: new Map() }),
    ).extractRow({ type: 'starCatalog', source: 'famousStar', index }, 0) as PlacedRow;
    expect(relErr(row.radiusMpc, 2.7531547855022603e-14)).toBeLessThan(1e-12);
  });
});
