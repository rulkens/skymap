import { composeSelectionRows } from '../../src/services/engine/selection/composeSelectionRows';
import { coreSelectionRows } from '../../src/services/engine/selection/coreSelectionRows';
import { galaxyCatalogSelectionRow } from '../../src/layers/galaxyCatalog/present/galaxyCatalogSelectionRow';
import { starCatalogSelectionRow } from '../../src/layers/starCatalog/present/starCatalogSelectionRow';
import { ALL_KINDS_ENABLED } from './allKindsEnabled';
import type { GalaxyCatalogRuntime } from '../../src/layers/galaxyCatalog/@types/GalaxyCatalogRuntime';
import type { StarCatalogRuntime } from '../../src/layers/starCatalog/@types/StarCatalogRuntime';
import type { ResolveDeps } from '../../src/@types/engine/ResolveDeps';
import type { SelectionResolver } from '../../src/@types/engine/selection/SelectionResolver';

/** What the galaxyCatalog Layer's selection row reads; the real runtime satisfies it. */
export type GalaxyRowFixture = Pick<GalaxyCatalogRuntime, 'catalogs' | 'famousMeta'>;

/** What the starCatalog Layer's selection row reads; the real runtime satisfies it. */
export type StarRowFixture = Pick<StarCatalogRuntime, 'renderer'>;

/**
 * A composed `SelectionResolver` over one fixed `ResolveDeps` — the one-line
 * fixture every former `ResolveDeps`-driven test call site now builds instead
 * of calling `resolvePick`/`extractSelectionRow`/`resolveFocusId`/`focusIdOf`
 * directly. `galaxies`/`stars` append the galaxyCatalog/starCatalog Layers'
 * own rows the way `createLayers` does; omit either for a composition with no
 * such data, where its ids resolve to null exactly as before that Layer is
 * created.
 */
export function selectionResolverOver(
  deps: ResolveDeps,
  galaxies?: GalaxyRowFixture,
  stars?: StarRowFixture,
): SelectionResolver {
  return composeSelectionRows(
    () => [
      ...coreSelectionRows(() => deps),
      ...(galaxies === undefined ? [] : [galaxyCatalogSelectionRow(galaxies)]),
      ...(stars === undefined ? [] : [starCatalogSelectionRow(stars)]),
    ],
    () => ALL_KINDS_ENABLED,
  );
}
