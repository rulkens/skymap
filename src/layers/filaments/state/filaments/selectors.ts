import { createSelector } from '@reduxjs/toolkit';

import { selectSettings } from '../../../../state/settings/selectSettings';
import type { FilamentsSettings } from '../../../../@types/settings/FilamentsSettings';

/** The one root hop for this slice, spelled `selectRoute` in every slice. */
export const selectRoute = createSelector(
  [selectSettings],
  (settings): FilamentsSettings => settings.filaments,
);

/** The whole cluster, under the slice's own name. */
export const selectFilaments = selectRoute;

export const selectFilamentsEnabled = createSelector(
  [selectRoute],
  (route: FilamentsSettings): boolean => route.enabled,
);

export const selectFilamentIntensity = createSelector(
  [selectRoute],
  (route: FilamentsSettings): number => route.intensity,
);
