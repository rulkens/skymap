/**
 * encodePick is the inverse of resolvePick: the word a label stamps for a ref
 * must unpack and resolve back to that same ref, or a highlight lands on the
 * wrong caption (or none) with nothing else noticing.
 */

import { describe, it, expect } from 'vitest';

import { Source, SOURCE_REGISTRY } from '../../../../src/data/sources';
import { unpackPick } from '../../../../src/data/selectionEncoding';
import { structurePickId } from '../../../../src/utils/picking/structurePickId';
import { SCENE_PLANETS } from '../../../../src/data/bodies/scenePlanets';
import { milkyWaySelectionRow } from '../../../../src/layers/milkyWay/present/milkyWaySelectionRow';
import { zoneOfAvoidanceSelectionRow } from '../../../../src/layers/zoneOfAvoidance/present/zoneOfAvoidanceSelectionRow';
import { blackHoleSelectionRow } from '../../../../src/layers/blackHoles/present/blackHoleSelectionRow';
import { starCatalogSelectionRow } from '../../../../src/layers/starCatalog/present/starCatalogSelectionRow';
import { galaxyCatalogSelectionRow } from '../../../../src/layers/galaxyCatalog/present/galaxyCatalogSelectionRow';
import { bodySelectionRow } from '../../../../src/services/engine/selection/bodySelectionRow';
import { structureSelectionRow } from '../../../../src/layers/structure/present/structureSelectionRow';
import type { SelectionRef } from '../../../../src/@types/engine/SelectionRef';
import { galaxyRowRuntime } from '../../../support/selectionResolverOver';
import { makeGalaxyCatalog } from '../../../fixtures/makeGalaxyCatalog';
import type { SelectionKindRow } from '../../../../src/@types/engine/layer/SelectionKindRow';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';

function roundTrip<Ref extends SelectionRef>(row: SelectionKindRow<Ref>, ref: Ref): Ref | null {
  const word = row.encodePick(ref);
  const pick = unpackPick(word!)!;
  return row.resolvePick(SOURCE_REGISTRY[pick.sourceCode], pick);
}

const STRUCTURES: StructureInfo[] = [
  { id: 'c0', category: 'galaxy-cluster' },
  { id: 's0', category: 'supercluster' },
  { id: 'c1', category: 'galaxy-cluster' },
] as StructureInfo[];
const structureStore = {
  byId: (id: string) => STRUCTURES.find((s) => s.id === id) ?? null,
  byCategory: (cat: string) => STRUCTURES.filter((s) => s.category === cat),
};

describe('SelectionKindRow.encodePick', () => {
  it('milkyWay and zoneOfAvoidance singletons', () => {
    expect(roundTrip(milkyWaySelectionRow(), { type: 'milkyWay' })).toEqual({ type: 'milkyWay' });
    expect(roundTrip(zoneOfAvoidanceSelectionRow(), { type: 'zoneOfAvoidance' })).toEqual({
      type: 'zoneOfAvoidance',
    });
  });

  it('blackHole', () => {
    const ref = { type: 'blackHole', id: 'sgr-a-star' } as const;
    expect(roundTrip(blackHoleSelectionRow(), ref)).toEqual(ref);
  });

  it('starCatalog and galaxyCatalog pack their own source and index', () => {
    const star = { type: 'starCatalog', source: Source.FamousStar, index: 3 } as const;
    expect(
      roundTrip(
        starCatalogSelectionRow({ renderer: null as never, chunkStreams: new Map() }),
        star,
      ),
    ).toEqual(star);
    const galaxy = { type: 'galaxyCatalog', source: Source.SDSS, index: 12 } as const;
    const catalogs = new Map([[Source.SDSS, makeGalaxyCatalog(16)]]);
    const row = galaxyCatalogSelectionRow(galaxyRowRuntime({ catalogs, famousMeta: [] }));
    expect(roundTrip(row, galaxy)).toEqual(galaxy);
  });

  it('body', () => {
    const ref = { type: 'body', id: SCENE_PLANETS[1]!.id } as const;
    expect(roundTrip(bodySelectionRow(), ref)).toEqual(ref);
    expect(bodySelectionRow().encodePick({ type: 'body', id: 'no-such-body' })).toBeNull();
  });

  it('structure: the index is per category, and matches the ring pick word', () => {
    const row = structureSelectionRow(structureStore);
    const ref = { type: 'structure', id: 'c1' } as const;
    expect(roundTrip(row, ref)).toEqual(ref);
    expect(row.encodePick(ref)).toBe(structurePickId('galaxy-cluster', 1));
    expect(row.encodePick({ type: 'structure', id: 'missing' })).toBeNull();
  });
});
