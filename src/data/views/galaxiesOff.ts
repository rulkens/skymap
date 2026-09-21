/**
 * GALAXIES_OFF — the `galaxyCatalogs` cluster with every survey silenced, the
 * backdrop both field views want. Shared because each view's "Galaxies" toggle
 * restores it too, and a second copy would drift the moment a catalog is added.
 */

import { initialState as galaxyCatalogsInitialState } from '../../layers/galaxyCatalog/state/galaxyCatalogs/initialState';
import type { GalaxyCatalogId } from '../../@types/data/galaxyCatalog/GalaxyCatalogId';
import type { GalaxyCatalogItemSettings } from '../../@types/settings/GalaxyCatalogItemSettings';

// `galaxyCatalogs` has no cluster-level master gate (GalaxyCatalogSettings.d.ts),
// so "galaxies off" means every item row disabled, not a single flag.
export const GALAXIES_OFF = {
  ...galaxyCatalogsInitialState,
  items: Object.fromEntries(
    Object.entries(galaxyCatalogsInitialState.items).map(([id, item]) => [
      id,
      { ...item, enabled: false },
    ]),
  ) as Record<GalaxyCatalogId, GalaxyCatalogItemSettings>,
};
