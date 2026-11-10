import { catalogPickCodes } from '../../src/utils/picking/catalogPickCodes';
import { STRUCTURE_IDS } from '../../src/data/structure/structureIds';
import { GALAXY_CATALOG_SOURCE_ROWS } from '../../src/layers/galaxyCatalog/sources/galaxyCatalogSourceRows';
import { STAR_CATALOG_SOURCE_ROWS } from '../../src/layers/starCatalog/sources/starCatalogSourceRows';
import { galaxyRecordBridge } from '../../src/layers/galaxyCatalog/selection/present/galaxyRecordBridge';
import { MILKY_WAY_ENTRY } from '../../src/layers/milkyWay/sources/milky-way';
import { SGR_A_STAR_ENTRY } from '../../src/layers/blackHoles/sources/sgrAStar';
import { SATELLITES_ENTRY } from '../../src/layers/satellites/sources/satellites';
import { ZONE_OF_AVOIDANCE_ENTRY } from '../../src/layers/zoneOfAvoidance/sources/zone-of-avoidance';
import { galaxyRecordsOver } from './galaxyRecordsOver';
import { BODY_SOURCE_ROWS } from '../../src/layers/body/sources/bodySourceRows';
import { CRAFT_ENTRY } from '../../src/layers/missions/sources/craft';
import { testPickCode } from './testPickCode';
import type { GalaxyCatalogRuntime } from '../../src/layers/galaxyCatalog/@types/GalaxyCatalogRuntime';
import type { StarCatalogRuntime } from '../../src/layers/starCatalog/@types/StarCatalogRuntime';
import type { GalaxyRowFixture, StarRowFixture } from './selectionResolverOver';
import type { StructureStore } from '../../src/layers/structure/catalog/@types/StructureStore';

/** The body Layer's `pickCodes`, as `create` builds them; pass `fakePickCode()` to catch a stamp that packs a catalog value. */
export function bodyPickCodes(pickCode = testPickCode('body')) {
  return catalogPickCodes(BODY_SOURCE_ROWS, pickCode);
}

/** The missions Layer's craft pick code, as `create` asks for it. */
export const missionsPickCode = (pickCode = testPickCode('missions')) => pickCode(CRAFT_ENTRY.id);

/** The structure Layer's `pickCodes`, as `create` builds them. */
export function structurePickCodes(pickCode = testPickCode('structure')) {
  return catalogPickCodes(
    STRUCTURE_IDS.map((id) => ({ id })),
    pickCode,
  );
}

/** The structure selection row's reads over a store fixture, plus the Layer's pick codes. */
export function structureRowRuntime(
  store: Pick<StructureStore, 'byId' | 'byCategory'>,
  pickCode = testPickCode('structure'),
) {
  return { store, pickCodes: structurePickCodes(pickCode) };
}

/** The single-row Layers' pick codes, as their `create` asks for them. */
export const milkyWayPickCode = (pickCode = testPickCode('milkyWay')) =>
  pickCode(MILKY_WAY_ENTRY.id);
export const blackHolePickCode = (pickCode = testPickCode('blackHoles')) =>
  pickCode(SGR_A_STAR_ENTRY.id);
export const satellitesPickCode = (pickCode = testPickCode('satellites')) =>
  pickCode(SATELLITES_ENTRY.id);
export const zoneOfAvoidancePickCode = (pickCode = testPickCode('zoneOfAvoidance')) =>
  pickCode(ZONE_OF_AVOIDANCE_ENTRY.id);

/** The galaxy selection row's reads over a fixture: flat record sources, their bridge and pick codes. */
export function galaxyRowRuntime(
  galaxies: GalaxyRowFixture,
  pickCode = testPickCode('galaxyCatalog'),
): Pick<GalaxyCatalogRuntime, 'records' | 'recordBridge' | 'pickCodes'> {
  const records = galaxyRecordsOver(galaxies.catalogs);
  return {
    records,
    recordBridge: galaxyRecordBridge(records),
    pickCodes: catalogPickCodes(GALAXY_CATALOG_SOURCE_ROWS, pickCode),
  };
}

/** The star selection row's reads over a fixture, plus the Layer's pick codes. */
export function starRowRuntime(
  stars: StarRowFixture,
  pickCode = testPickCode('starCatalog'),
): Pick<StarCatalogRuntime, 'renderer' | 'chunkStreams' | 'pickCodes'> {
  return { ...stars, pickCodes: catalogPickCodes(STAR_CATALOG_SOURCE_ROWS, pickCode) };
}
