/**
 * SURVEYS_OFF — the `galaxyCatalogs` cluster with every survey silenced but the
 * famous galaxies kept as named landmarks, the backdrop both field exhibits
 * want. Shared because each exhibit's "Galaxies" toggle restores it too, and a
 * second copy would drift the moment a catalog is added.
 */

import { initialState as galaxyCatalogsInitialState } from '../../../layers/galaxyCatalog/state/galaxyCatalogs/initialState';
import type { GalaxyCatalogId } from '../../../@types/data/galaxyCatalog/GalaxyCatalogId';
import type { GalaxyCatalogItemSettings } from '../../../@types/settings/GalaxyCatalogItemSettings';

// `galaxyCatalogs` has no cluster-level master gate (GalaxyCatalogSettings.d.ts),
// so "surveys off" means every survey row disabled, not a single flag.
export const SURVEYS_OFF = {
  ...galaxyCatalogsInitialState,
  items: Object.fromEntries(
    Object.entries(galaxyCatalogsInitialState.items).map(([id, item]) => [
      id,
      { ...item, enabled: id === 'famousGalaxy' && item.enabled },
    ]),
  ) as Record<GalaxyCatalogId, GalaxyCatalogItemSettings>,
};
