/**
 * SURVEYS_OFF — the `galaxyCatalogs` cluster with every survey silenced but the
 * famous galaxies kept as named landmarks, the backdrop both field exhibits
 * want. Shared so the two cannot drift when a catalog is added; `GALAXIES_SWITCH`
 * reads the same rows to switch them back on.
 */

import { initialState as galaxyCatalogsInitialState } from '../../../layers/galaxyCatalog/state/galaxyCatalogs/initialState';

// `galaxyCatalogs` has no cluster-level master gate (GalaxyCatalogSettings.d.ts),
// so "surveys off" means every survey row disabled, not a single flag.
export const SURVEYS_OFF = {
  ...galaxyCatalogsInitialState,
  items: Object.fromEntries(
    Object.entries(galaxyCatalogsInitialState.items).map(([id, item]) => [
      id,
      { ...item, enabled: id === 'famousGalaxy' && item.enabled },
    ]),
  ) as typeof galaxyCatalogsInitialState.items,
};
