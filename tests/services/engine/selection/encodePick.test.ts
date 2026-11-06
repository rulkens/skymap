/**
 * encodePick is the inverse of resolvePick: the word a label stamps for a ref
 * must unpack and resolve back to that same ref, or a highlight lands on the
 * wrong caption (or none) with nothing else noticing.
 */

import { describe, it, expect } from 'vitest';

import { Source } from '../../../../src/data/source';
import { unpackPick } from '../../../../src/data/selectionEncoding';
import { structurePickId } from '../../../../src/layers/structure/picking/utils/structurePickId';
import { SCENE_PLANETS } from '../../../../src/data/bodies/scenePlanets';
import { milkyWaySelectionRow } from '../../../../src/layers/milkyWay/card/present/milkyWaySelectionRow';
import { zoneOfAvoidanceSelectionRow } from '../../../../src/layers/zoneOfAvoidance/selection/present/zoneOfAvoidanceSelectionRow';
import { blackHoleSelectionRow } from '../../../../src/layers/blackHoles/markers/present/blackHoleSelectionRow';
import { starCatalogSelectionRow } from '../../../../src/layers/starCatalog/selection/present/starCatalogSelectionRow';
import { galaxyCatalogSelectionRow } from '../../../../src/layers/galaxyCatalog/selection/present/galaxyCatalogSelectionRow';
import { bodySelectionRow } from '../../../../src/layers/body/selection/present/bodySelectionRow';
import { structureSelectionRow } from '../../../../src/layers/structure/picking/present/structureSelectionRow';
import { galaxyRowRuntime, starRowRuntime } from '../../../support/layerPickCodes';
import { makeGalaxyCatalog } from '../../../fixtures/makeGalaxyCatalog';
import type { SelectionKindRow } from '../../../../src/@types/engine/layer/SelectionKindRow';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';
import { asSceneBodyId } from '../../../../src/utils/scene/asSceneBodyId';
import {
  blackHolePickCode,
  bodyPickCodes,
  milkyWayPickCode,
  structurePickCodes,
  structureRowRuntime,
  zoneOfAvoidancePickCode,
} from '../../../support/layerPickCodes';
import type { SelectionRefBase } from '../../../../src/@types/engine/selection/SelectionRefBase';

function roundTrip<Ref extends SelectionRefBase>(row: SelectionKindRow<Ref>, ref: Ref): Ref | null {
  const word = row.encodePick(ref);
  const pick = unpackPick(word!)!;
  return row.resolvePick(pick);
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
    expect(roundTrip(milkyWaySelectionRow(milkyWayPickCode()), { type: 'milkyWay' })).toEqual({
      type: 'milkyWay',
    });
    expect(
      roundTrip(zoneOfAvoidanceSelectionRow(zoneOfAvoidancePickCode()), {
        type: 'zoneOfAvoidance',
      }),
    ).toEqual({
      type: 'zoneOfAvoidance',
    });
  });

  it('blackHole', () => {
    const ref = { type: 'blackHole', id: 'sgr-a-star' } as const;
    expect(roundTrip(blackHoleSelectionRow(blackHolePickCode()), ref)).toEqual(ref);
  });

  it('starCatalog and galaxyCatalog pack their own source and index', () => {
    const star = { type: 'starCatalog', source: Source.FamousStar, index: 3 } as const;
    expect(
      roundTrip(
        starCatalogSelectionRow(
          starRowRuntime({ renderer: null as never, chunkStreams: new Map() }),
        ),
        star,
      ),
    ).toEqual(star);
    const galaxy = { type: 'galaxyCatalog', source: Source.SDSS, index: 12 } as const;
    const catalogs = new Map([[Source.SDSS, makeGalaxyCatalog(16)]]);
    const row = galaxyCatalogSelectionRow(galaxyRowRuntime({ catalogs }));
    expect(roundTrip(row, galaxy)).toEqual(galaxy);
  });

  it('body', () => {
    const ref = { type: 'body', id: SCENE_PLANETS[1]!.id } as const;
    expect(roundTrip(bodySelectionRow({ pickCodes: bodyPickCodes() }), ref)).toEqual(ref);
    expect(
      bodySelectionRow({ pickCodes: bodyPickCodes() }).encodePick({
        type: 'body',
        id: asSceneBodyId('no-such-body'),
      }),
    ).toBeNull();
  });

  it('structure: the index is per category, and matches the ring pick word', () => {
    const row = structureSelectionRow(structureRowRuntime(structureStore));
    const ref = { type: 'structure', id: 'c1' } as const;
    expect(roundTrip(row, ref)).toEqual(ref);
    expect(row.encodePick(ref)).toBe(structurePickId('galaxy-cluster', 1, structurePickCodes()));
    expect(row.encodePick({ type: 'structure', id: 'missing' })).toBeNull();
  });
});
