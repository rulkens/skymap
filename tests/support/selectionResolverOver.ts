import { composeSelectionRows } from '../../src/services/engine/selection/composeSelectionRows';
import { coreSelectionRows } from '../../src/services/engine/selection/coreSelectionRows';
import { galaxyCatalogSelectionRow } from '../../src/layers/galaxyCatalog/present/galaxyCatalogSelectionRow';
import { ALL_KINDS_ENABLED } from './allKindsEnabled';
import type { GalaxyCatalogRuntime } from '../../src/layers/galaxyCatalog/@types/GalaxyCatalogRuntime';
import type { ResolveDeps } from '../../src/@types/engine/ResolveDeps';
import type { SelectionResolver } from '../../src/@types/engine/selection/SelectionResolver';

/** What the galaxyCatalog Layer's selection row reads; the real runtime satisfies it. */
export type GalaxyRowFixture = Pick<GalaxyCatalogRuntime, 'catalogs' | 'famousMeta'>;

/**
 * A composed `SelectionResolver` over one fixed `ResolveDeps` — the one-line
 * fixture every former `ResolveDeps`-driven test call site now builds instead
 * of calling `resolvePick`/`extractSelectionRow`/`resolveFocusId`/`focusIdOf`
 * directly. `galaxies` appends the galaxyCatalog Layer's row the way
 * `createLayers` does; omit it for a composition with no galaxy data, where a
 * galaxy id resolves to null exactly as it does before that Layer is created.
 */
export function selectionResolverOver(
  deps: ResolveDeps,
  galaxies?: GalaxyRowFixture,
): SelectionResolver {
  return composeSelectionRows(
    () => [
      ...coreSelectionRows(() => deps),
      ...(galaxies === undefined ? [] : [galaxyCatalogSelectionRow(galaxies)]),
    ],
    () => ALL_KINDS_ENABLED,
  );
}
