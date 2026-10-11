import { composeSelectionRows } from '../../src/services/engine/selection/composeSelectionRows';
import { coreSelectionRows } from '../../src/services/engine/selection/coreSelectionRows';
import { structureSelectionRow } from '../../src/layers/structure/present/structureSelectionRow';
import { galaxyCatalogSelectionRow } from '../../src/layers/galaxyCatalog/present/galaxyCatalogSelectionRow';
import { starCatalogSelectionRow } from '../../src/layers/starCatalog/present/starCatalogSelectionRow';
import { milkyWaySelectionRow } from '../../src/layers/milkyWay/present/milkyWaySelectionRow';
import { ALL_KINDS_ENABLED } from './allKindsEnabled';
import type { GalaxyCatalogRuntime } from '../../src/layers/galaxyCatalog/@types/GalaxyCatalogRuntime';
import type { StarCatalogRuntime } from '../../src/layers/starCatalog/@types/StarCatalogRuntime';
import type { StructureStore } from '../../src/@types/engine/data/StructureStore';
import type { SelectionResolver } from '../../src/@types/engine/selection/SelectionResolver';

/** What the structure selection row reads; the real store satisfies it. */
export type StructureRowFixture = Pick<StructureStore, 'byId' | 'byCategory'>;

/** What the galaxyCatalog Layer's selection row reads; the real runtime satisfies it. */
export type GalaxyRowFixture = Pick<GalaxyCatalogRuntime, 'catalogs' | 'famousMeta'>;

/** What the starCatalog Layer's selection row reads; the real runtime satisfies it. */
export type StarRowFixture = Pick<StarCatalogRuntime, 'renderer'>;

/**
 * A composed `SelectionResolver` over fixed fixtures — the one-line fixture a
 * test builds instead of calling `resolvePick`/`extractSelectionRow`/
 * `resolveFocusId`/`focusIdOf` directly. `structures`/`galaxies`/`stars`
 * append the structure, galaxyCatalog and starCatalog rows the way the engine
 * and `createLayers` do; omit one for a composition with no such data, where
 * its ids resolve to null exactly as before that row is registered.
 */
export function selectionResolverOver(
  structures?: StructureRowFixture,
  galaxies?: GalaxyRowFixture,
  stars?: StarRowFixture,
): SelectionResolver {
  return composeSelectionRows(
    () => [
      ...coreSelectionRows(),
      ...(structures === undefined ? [] : [structureSelectionRow(structures)]),
      milkyWaySelectionRow(),
      ...(galaxies === undefined ? [] : [galaxyCatalogSelectionRow(galaxies)]),
      ...(stars === undefined ? [] : [starCatalogSelectionRow(stars)]),
    ],
    () => ALL_KINDS_ENABLED,
  );
}
