/**
 * Pick codes are a per-session runtime detail: two engines that number them
 * differently must persist byte-identical state. One ref per kind goes through
 * its row's pick word and back under each allocator; a row that leaked its code
 * into the ref (`source: pick.sourceCode`) would surface here as a URL or a
 * selection slice that differs between the two.
 */

import { describe, it, expect } from 'vitest';

import { createPickCodeAllocator } from '../../../../src/services/engine/selection/createPickCodeAllocator';
import { composeSelectionRows } from '../../../../src/services/engine/selection/composeSelectionRows';
import { unpackPick } from '../../../../src/data/selectionEncoding';
import { Source } from '../../../../src/data/source';
import { SCENE_PLANETS } from '../../../../src/data/bodies/scenePlanets';
import { createAppStore } from '../../../../src/store/createAppStore';
import { hashBodyFor } from '../../../../src/state/url/hashBodyFor';
import { setSelectionRow } from '../../../../src/state/selectionRows/selectionRowsSlice';
import { updateSelectionSelect } from '../../../../src/state/selection/selectionSlice';
import { galaxyCatalogSelectionRow } from '../../../../src/layers/galaxyCatalog/selection/present/galaxyCatalogSelectionRow';
import { starCatalogSelectionRow } from '../../../../src/layers/starCatalog/selection/present/starCatalogSelectionRow';
import { bodySelectionRow } from '../../../../src/layers/body/selection/present/bodySelectionRow';
import { craftSelectionRow } from '../../../../src/layers/missions/craft/present/craftSelectionRow';
import { earthSceneSelectionRow } from '../../../../src/layers/earthScenes/scenes/present/earthSceneSelectionRow';
import { structureSelectionRow } from '../../../../src/layers/structure/picking/present/structureSelectionRow';
import { milkyWaySelectionRow } from '../../../../src/layers/milkyWay/card/present/milkyWaySelectionRow';
import { blackHoleSelectionRow } from '../../../../src/layers/blackHoles/markers/present/blackHoleSelectionRow';
import { satellitesSelectionRow } from '../../../../src/layers/satellites/focus/present/satellitesSelectionRow';
import { zoneOfAvoidanceSelectionRow } from '../../../../src/layers/zoneOfAvoidance/selection/present/zoneOfAvoidanceSelectionRow';
import { buildSatelliteCatalog } from '../../../../tools/satellites/buildSatelliteCatalog';
import { ISS } from '../../../layers/satellites/fixtures/celestrakRecords';
import { makeGalaxyCatalog } from '../../../fixtures/makeGalaxyCatalog';
import { NO_KINDS_OFF } from '../../../support/noKindsOff';
import { NOOP_SAGA_CONTEXT } from '../../../support/createTestStore';
import {
  blackHolePickCode,
  bodyPickCodes,
  galaxyRowRuntime,
  milkyWayPickCode,
  missionsPickCode,
  satellitesPickCode,
  starRowRuntime,
  structureRowRuntime,
  zoneOfAvoidancePickCode,
} from '../../../support/layerPickCodes';
import { asSceneBodyId } from '../../../../src/utils/scene/asSceneBodyId';
import type { PickCodeAllocator } from '../../../../src/@types/engine/selection/PickCodeAllocator';
import type { SelectionKindRow } from '../../../../src/@types/engine/layer/SelectionKindRow';
import type { SelectionRef } from '../../../../src/@types/engine/SelectionRef';
import type { SatellitesRuntime } from '../../../../src/layers/satellites/@types/SatellitesRuntime';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';

const virgo = { id: 'virgo', category: 'galaxy-cluster' } as StructureInfo;
const structures = {
  byId: (id: string) => (id === virgo.id ? virgo : null),
  byCategory: (category: string) => (category === virgo.category ? [virgo] : []),
};
const { catalog: satellites } = buildSatelliteCatalog(
  [{ group: { group: 'active', class: 'active' }, records: [ISS] }],
  0,
);

/** One row and one ref per kind; the row's codes come from `allocator`. */
function casesUnder(allocator: PickCodeAllocator) {
  const pickCode = (layer: string) => (id: string) => allocator.codeOf(layer, id);
  const kind = <Ref extends SelectionRef>(row: SelectionKindRow<Ref>, ref: Ref) => ({
    row: row as unknown as SelectionKindRow,
    ref: ref as SelectionRef,
  });
  return [
    kind(
      galaxyCatalogSelectionRow(
        galaxyRowRuntime(
          { catalogs: new Map([[Source.SDSS, makeGalaxyCatalog(16)]]), famousMeta: [] },
          pickCode('galaxyCatalog'),
        ),
      ),
      { type: 'galaxyCatalog', source: Source.SDSS, index: 12 },
    ),
    kind(
      starCatalogSelectionRow(
        starRowRuntime(
          { renderer: null as never, chunkStreams: new Map() },
          pickCode('starCatalog'),
        ),
      ),
      { type: 'starCatalog', source: Source.FamousStar, index: 3 },
    ),
    kind(bodySelectionRow({ pickCodes: bodyPickCodes(pickCode('body')) }), {
      type: 'body',
      id: SCENE_PLANETS[1]!.id,
    }),
    kind(craftSelectionRow(missionsPickCode(pickCode('missions'))), {
      type: 'craft',
      id: asSceneBodyId('hubble'),
    }),
    // Unpicked (no pick source): its ref is persisted as given.
    kind(earthSceneSelectionRow(), { type: 'earthScene', id: asSceneBodyId('soendermarken') }),
    kind(structureSelectionRow(structureRowRuntime(structures, pickCode('structure'))), {
      type: 'structure',
      id: 'virgo',
    }),
    kind(milkyWaySelectionRow(milkyWayPickCode(pickCode('milkyWay'))), { type: 'milkyWay' }),
    kind(blackHoleSelectionRow(blackHolePickCode(pickCode('blackHoles'))), {
      type: 'blackHole',
      id: 'sgr-a-star',
    }),
    kind(
      satellitesSelectionRow({
        propagator: { catalog: () => satellites },
        pickCode: satellitesPickCode(pickCode('satellites')),
      } as unknown as SatellitesRuntime),
      { type: 'satellite', noradId: 25544 },
    ),
    kind(zoneOfAvoidanceSelectionRow(zoneOfAvoidancePickCode(pickCode('zoneOfAvoidance'))), {
      type: 'zoneOfAvoidance',
    }),
  ];
}

/** Every kind's ref after a trip through its pick word, plus the words, under `allocator`. */
function pickedUnder(allocator: PickCodeAllocator) {
  const cases = casesUnder(allocator);
  const resolver = composeSelectionRows(
    () => cases.map((c) => c.row),
    () => NO_KINDS_OFF,
  );
  const words = cases.map((c) => c.row.encodePick(c.ref));
  const refs = cases.map((c, i) => {
    const word = words[i]!;
    return word === null ? c.ref : resolver.resolvePick(unpackPick(word));
  });
  return { resolver, words, refs, given: cases.map((c) => c.ref) };
}

const dense = pickedUnder(createPickCodeAllocator());
const shifted = pickedUnder(
  (() => {
    // Twenty codes taken first, so every Layer's code differs from the dense run's.
    const allocator = createPickCodeAllocator();
    for (let i = 0; i < 20; i++) allocator.codeOf('other', `id${i}`);
    return allocator;
  })(),
);

function storeOver(run: typeof dense) {
  const handle = createAppStore();
  handle.setSagaContext({ ...NOOP_SAGA_CONTEXT, selection: run.resolver });
  return handle.store;
}

describe('pick codes are never persisted', () => {
  it('every ref survives its pick word, and the two allocators stamp different words', () => {
    expect(dense.refs).toEqual(dense.given);
    expect(shifted.refs).toEqual(shifted.given);
    const picked = dense.words.filter((w) => w !== null);
    expect(picked.length).toBe(dense.words.length - 1);
    expect(dense.words.every((w, i) => w === null || w !== shifted.words[i])).toBe(true);
  });

  it('the URL hash and selection slice of a focused ref of every kind hold no pick code', () => {
    const hashes = (run: typeof dense) => {
      const store = storeOver(run);
      return run.refs.map((ref) => {
        const focusId = run.resolver.focusIdOf(ref!);
        store.dispatch(setSelectionRow({ slot: 'focus', row: null, focusId }));
        store.dispatch(updateSelectionSelect(ref));
        return { hash: hashBodyFor(store.getState()), selection: store.getState().selection };
      });
    };
    expect(hashes(shifted)).toEqual(hashes(dense));
  });
});
