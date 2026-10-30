/**
 * The composed resolver's `focusIdOf` for one ref of every kind, pinned to the literal
 * `#focus=` ids links in the wild carry. Each ref is extracted first so a row that
 * cannot resolve fails here rather than encoding a stale id.
 */
import { describe, it, expect } from 'vitest';
import { composeSelectionRows } from '../../../../src/services/engine/selection/composeSelectionRows';
import { bodySelectionRow } from '../../../../src/layers/body/present/bodySelectionRow';
import { craftSelectionRow } from '../../../../src/layers/missions/present/craftSelectionRow';
import { earthSceneSelectionRow } from '../../../../src/layers/earthScenes/present/earthSceneSelectionRow';
import { structureSelectionRow } from '../../../../src/layers/structure/present/structureSelectionRow';
import { milkyWaySelectionRow } from '../../../../src/layers/milkyWay/present/milkyWaySelectionRow';
import { zoneOfAvoidanceSelectionRow } from '../../../../src/layers/zoneOfAvoidance/present/zoneOfAvoidanceSelectionRow';
import { blackHoleSelectionRow } from '../../../../src/layers/blackHoles/present/blackHoleSelectionRow';
import { satellitesSelectionRow } from '../../../../src/layers/satellites/present/satellitesSelectionRow';
import { starCatalogSelectionRow } from '../../../../src/layers/starCatalog/present/starCatalogSelectionRow';
import { galaxyCatalogSelectionRow } from '../../../../src/layers/galaxyCatalog/present/galaxyCatalogSelectionRow';
import { galaxyRowRuntime } from '../../../support/selectionResolverOver';
import { ALL_KINDS_ENABLED } from '../../../support/allKindsEnabled';
import { makeGalaxyCatalog } from '../../../fixtures/makeGalaxyCatalog';
import { buildSatelliteCatalog } from '../../../../tools/satellites/buildSatelliteCatalog';
import { ISS } from '../../../layers/satellites/fixtures/celestrakRecords';
import { SCENE_STARS } from '../../../../src/data/bodies/sceneStars';
import { unixMsToJulianDays } from '../../../../src/utils/time/unixMsToJulianDays';
import { Source } from '../../../../src/data/source';
import type { SelectionRef } from '../../../../src/@types/engine/SelectionRef';
import type { SatellitesRuntime } from '../../../../src/layers/satellites/@types/SatellitesRuntime';
import type { StarCatalogRuntime } from '../../../../src/layers/starCatalog/@types/StarCatalogRuntime';
import type { GalaxyRowFixture } from '../../../support/selectionResolverOver';

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
const IDS: [string, SelectionRef, string | null][] = [
  ['famous galaxy', { type: 'galaxyCatalog', source: Source.FamousGalaxy, index: 0 }, 'm31'],
  ['PGC galaxy', { type: 'galaxyCatalog', source: Source.Glade, index: 0 }, 'pgc-2789'],
  [
    'SDSS galaxy',
    { type: 'galaxyCatalog', source: Source.SDSS, index: 0 },
    'sdss-1237665128253423687',
  ],
  [
    'galaxy with no catalog id',
    { type: 'galaxyCatalog', source: Source.TwoMRS, index: 0 },
    'pos@11.3099,-16.3925,106.30',
  ],
  ['structure', { type: 'structure', id: 'cluster-virgo-m87' }, 'cluster-virgo-m87'],
  ['milky way', { type: 'milkyWay' }, 'milkyWay'],
  ['zone of avoidance', { type: 'zoneOfAvoidance' }, null],
  ['body', { type: 'body', id: 'moon' as never }, 'body-moon'],
  ['craft', { type: 'craft', id: 'hubble' as never }, 'body-hubble'],
  ['earth scene', { type: 'earthScene', id: 'soendermarken' as never }, 'body-soendermarken'],
  [
    'seeded star',
    { type: 'starCatalog', source: Source.FamousStar, index: siriusIndex },
    'star-sirius',
  ],
  ['survey star', { type: 'starCatalog', source: Source.GaiaStars, index: 1007 }, 'star-1007'],
  ['black hole', { type: 'blackHole', id: 'sgr-a-star' as never }, 'blackhole-sgr-a-star'],
  ['satellite', { type: 'satellite', noradId: 25544 }, 'satellite-25544'],
];

describe('focusIdOf over every selection kind', () => {
  it.each(IDS)('%s', (_name, ref, id) => {
    // A survey star's row needs a loaded catalog; its id never reads the row.
    if (!(ref.type === 'starCatalog' && ref.source === Source.GaiaStars)) {
      expect(resolver.extractRow(ref, AT)).not.toBeNull();
    }
    expect(resolver.focusIdOf(ref)).toBe(id);
  });
});
