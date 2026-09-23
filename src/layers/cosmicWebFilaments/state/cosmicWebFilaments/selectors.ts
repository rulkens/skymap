import { createSelector } from '@reduxjs/toolkit';

import { selectSettings } from '../../../../state/settings/selectSettings';
import type { CosmicWebFilamentsSettings } from '../../../../@types/settings/CosmicWebFilamentsSettings';

/** The one root hop for this slice, spelled `selectRoute` in every slice. */
export const selectRoute = createSelector(
  [selectSettings],
  (settings): CosmicWebFilamentsSettings => settings.cosmicWebFilaments,
);

/** The whole cluster, under the slice's own name. */
export const selectCosmicWebFilaments = selectRoute;

export const selectCosmicWebFilamentsEnabled = createSelector(
  [selectRoute],
  (route: CosmicWebFilamentsSettings): boolean => route.enabled,
);

export const selectCosmicWebFilamentsIntensity = createSelector(
  [selectRoute],
  (route: CosmicWebFilamentsSettings): number => route.intensity,
);
