/** Temporary parity: Layer row focusId.encode vs URL_HASH_FOR over the extracted row. */
import { describe, it, expect } from 'vitest';
import { URL_HASH_FOR } from '../../../src/services/url/urlHashFor';
import { buildFocusable } from '../../../src/services/engine/helpers/buildFocusable';
import { composeSelectionRows } from '../../../src/services/engine/selection/composeSelectionRows';
import { bodySelectionRow } from '../../../src/layers/body/present/bodySelectionRow';
import { craftSelectionRow } from '../../../src/layers/missions/present/craftSelectionRow';
import { earthSceneSelectionRow } from '../../../src/layers/earthScenes/present/earthSceneSelectionRow';
import { structureSelectionRow } from '../../../src/layers/structure/present/structureSelectionRow';
import { milkyWaySelectionRow } from '../../../src/layers/milkyWay/present/milkyWaySelectionRow';
import { zoneOfAvoidanceSelectionRow } from '../../../src/layers/zoneOfAvoidance/present/zoneOfAvoidanceSelectionRow';
import { blackHoleSelectionRow } from '../../../src/layers/blackHoles/present/blackHoleSelectionRow';
import { satellitesSelectionRow } from '../../../src/layers/satellites/present/satellitesSelectionRow';
import { starCatalogSelectionRow } from '../../../src/layers/starCatalog/present/starCatalogSelectionRow';
import { galaxyCatalogSelectionRow } from '../../../src/layers/galaxyCatalog/present/galaxyCatalogSelectionRow';
import { galaxyRowRuntime } from '../../support/selectionResolverOver';
import { ALL_KINDS_ENABLED } from '../../support/allKindsEnabled';
import { makeGalaxyCatalog } from '../../fixtures/makeGalaxyCatalog';
import { buildSatelliteCatalog } from '../../../tools/satellites/buildSatelliteCatalog';
import { ISS } from '../../layers/satellites/fixtures/celestrakRecords';
import { SCENE_STARS } from '../../../src/data/bodies/sceneStars';
import { unixMsToJulianDays } from '../../../src/utils/time/unixMsToJulianDays';
import { Source } from '../../../src/data/source';
import type { SelectionRef } from '../../../src/@types/engine/SelectionRef';
import type { SatellitesRuntime } from '../../../src/layers/satellites/@types/SatellitesRuntime';
import type { StarCatalogRuntime } from '../../../src/layers/starCatalog/@types/StarCatalogRuntime';
import type { GalaxyRowFixture } from '../../support/selectionResolverOver';

const { catalog } = buildSatelliteCatalog(
  [{ group: { group: 'active', class: 'active' }, records: [ISS] }],
  0,
);
const structure = {
  type: 'structure',
  id: 'cluster-virgo-m87',
  name: 'Virgo',
  category: 'galaxy-cluster',
  worldPos: [0, 0, 0],
  featured: true,
  physicalRadiusMpc: 2,
};
const cat = (objId: bigint) =>
  makeGalaxyCatalog(1, {
    positions: new Float32Array([100, 20, -30]),
    spectroscopicZ: new Float32Array([0.02]),
    objIDs: new BigUint64Array([objId]),
  });
const galaxies = {
  catalogs: new Map([
    [Source.SDSS, cat(1237665128253423687n)],
    [Source.Glade, cat(2789n)],
    [Source.TwoMRS, cat(0n)],
    [Source.FamousGalaxy, cat(0n)],
  ]),
  famousMeta: [{ id: 'm31', names: ['M31'], description: '', type: 'SBb' }],
} as unknown as GalaxyRowFixture;

const resolver = composeSelectionRows(
  () => [
    bodySelectionRow(),
    craftSelectionRow(),
    earthSceneSelectionRow(),
    structureSelectionRow({ byId: () => structure as never, byCategory: () => [] }),
    milkyWaySelectionRow(),
    zoneOfAvoidanceSelectionRow(),
    blackHoleSelectionRow(),
    satellitesSelectionRow({
      propagator: { catalog: () => catalog },
    } as unknown as SatellitesRuntime),
    starCatalogSelectionRow({
      renderer: { loadedCatalogs: () => [] },
      chunkStreams: new Map(),
    } as unknown as Pick<StarCatalogRuntime, 'renderer' | 'chunkStreams'>),
    galaxyCatalogSelectionRow(galaxyRowRuntime(galaxies)),
  ],
  () => ALL_KINDS_ENABLED,
);

const AT = unixMsToJulianDays(Date.parse('2026-10-28T12:00:00Z'));
const siriusIndex = SCENE_STARS.findIndex((s) => s.id === 'sirius');
const REFS: [string, SelectionRef][] = [
  ['galaxy famous', { type: 'galaxyCatalog', source: Source.FamousGalaxy, index: 0 }],
  ['galaxy pgc', { type: 'galaxyCatalog', source: Source.Glade, index: 0 }],
  ['galaxy sdss', { type: 'galaxyCatalog', source: Source.SDSS, index: 0 }],
  ['galaxy pos@', { type: 'galaxyCatalog', source: Source.TwoMRS, index: 0 }],
  ['structure', { type: 'structure', id: 'cluster-virgo-m87' }],
  ['milkyWay', { type: 'milkyWay' }],
  ['zoneOfAvoidance', { type: 'zoneOfAvoidance' }],
  ['body', { type: 'body', id: 'moon' as never }],
  ['craft', { type: 'craft', id: 'hubble' as never }],
  ['earthScene', { type: 'earthScene', id: 'soendermarken' as never }],
  ['star seeded', { type: 'starCatalog', source: Source.FamousStar, index: siriusIndex }],
  ['blackHole', { type: 'blackHole', id: 'sgr-a-star' as never }],
  ['satellite', { type: 'satellite', noradId: 25544 }],
];

describe('focus id parity', () => {
  it.each(REFS)('%s', (_name, ref) => {
    const row = resolver.extractRow(ref, AT);
    expect(row).not.toBeNull();
    const target = buildFocusable(row, [])!;
    const old = URL_HASH_FOR[target.type](target) || null;
    const next = resolver.focusIdOf(ref);
    expect(next).toBe(old);
  });

  it('survey star', () => {
    const ref: SelectionRef = { type: 'starCatalog', source: Source.GaiaStars, index: 1007 };
    const target = buildFocusable(
      {
        type: 'starCatalog',
        source: Source.GaiaStars,
        index: 1007,
        id: null,
        label: 'Field star',
        positionMpc: [1, 2, 3],
        radiusM: 1,
      } as never,
      [],
    )!;
    const old = URL_HASH_FOR[target.type](target) || null;
    expect(resolver.focusIdOf(ref)).toBe(old);
  });
});
