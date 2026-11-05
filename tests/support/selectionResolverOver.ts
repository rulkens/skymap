import { composeSelectionRows } from '../../src/services/engine/selection/composeSelectionRows';
import { bodySelectionRow } from '../../src/layers/body/selection/present/bodySelectionRow';
import { structureSelectionRow } from '../../src/layers/structure/picking/present/structureSelectionRow';
import { galaxyCatalogSelectionRow } from '../../src/layers/galaxyCatalog/selection/present/galaxyCatalogSelectionRow';
import { galaxyRecordBridge } from '../../src/layers/galaxyCatalog/selection/present/galaxyRecordBridge';
import { catalogPickCodes } from '../../src/utils/picking/catalogPickCodes';
import { GALAXY_CATALOG_SOURCE_ROWS } from '../../src/layers/galaxyCatalog/sources/galaxyCatalogSourceRows';
import { STAR_CATALOG_SOURCE_ROWS } from '../../src/layers/starCatalog/sources/starCatalogSourceRows';
import { starCatalogSelectionRow } from '../../src/layers/starCatalog/selection/present/starCatalogSelectionRow';
import { milkyWaySelectionRow } from '../../src/layers/milkyWay/card/present/milkyWaySelectionRow';
import { ALL_KINDS_ENABLED } from './allKindsEnabled';
import { galaxyRecordsOver } from './galaxyRecordsOver';
import { testPickCode } from './testPickCode';
import type { GalaxyCatalogRuntime } from '../../src/layers/galaxyCatalog/@types/GalaxyCatalogRuntime';
import type { StarCatalogRuntime } from '../../src/layers/starCatalog/@types/StarCatalogRuntime';
import type { StructureStore } from '../../src/layers/structure/catalog/@types/StructureStore';
import type { SelectionResolver } from '../../src/@types/engine/selection/SelectionResolver';
import { bodyPickCodes, milkyWayPickCode, structureRowRuntime } from './layerPickCodes';

/** What the structure selection row reads; the real store satisfies it. */
export type StructureRowFixture = Pick<StructureStore, 'byId' | 'byCategory'>;

/** The catalogs a galaxy fixture loads; `galaxyRowRuntime` builds the row's reads from them. */
export type GalaxyRowFixture = Pick<GalaxyCatalogRuntime, 'catalogs' | 'famousMeta'>;

/** What the starCatalog Layer's selection row reads; the real runtime satisfies it. */
export type StarRowFixture = Pick<StarCatalogRuntime, 'renderer' | 'chunkStreams'>;

/** The galaxy selection row's reads over a fixture: flat record sources, their bridge and pick codes. */
export function galaxyRowRuntime(
  galaxies: GalaxyRowFixture,
  pickCode = testPickCode('galaxyCatalog'),
): Pick<GalaxyCatalogRuntime, 'records' | 'recordBridge' | 'famousMeta' | 'pickCodes'> {
  const records = galaxyRecordsOver(galaxies.catalogs, () => galaxies.famousMeta);
  return {
    records,
    recordBridge: galaxyRecordBridge(records),
    famousMeta: galaxies.famousMeta,
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

/**
 * A composed `SelectionResolver` over fixed fixtures — the one-line fixture a
 * test builds instead of calling `resolvePick`/`extractSelectionRow`/
 * `resolveFocusId`/`focusIdOf` directly. `structures` feeds the structure row;
 * `galaxies`/`stars` append the galaxyCatalog/starCatalog Layers' rows the way
 * `createLayers` does — omit either for a composition with no such data, where
 * its ids resolve to null exactly as before that Layer is created.
 */
export function selectionResolverOver(
  structures: StructureRowFixture,
  galaxies?: GalaxyRowFixture,
  stars?: StarRowFixture,
): SelectionResolver {
  return composeSelectionRows(
    () => [
      bodySelectionRow({ pickCodes: bodyPickCodes() }),
      structureSelectionRow(structureRowRuntime(structures)),
      milkyWaySelectionRow(milkyWayPickCode()),
      ...(galaxies === undefined ? [] : [galaxyCatalogSelectionRow(galaxyRowRuntime(galaxies))]),
      ...(stars === undefined ? [] : [starCatalogSelectionRow(starRowRuntime(stars))]),
    ],
    () => ALL_KINDS_ENABLED,
  );
}
