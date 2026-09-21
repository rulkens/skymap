import { createSelector } from '@reduxjs/toolkit';

import { selectSettings } from '../../../../state/settings/selectSettings';
import type { ConstellationsSettings } from '../../../../@types/settings/ConstellationsSettings';

/** The one root hop for this slice, spelled `selectRoute` in every slice. */
export const selectRoute = createSelector(
  [selectSettings],
  (settings): ConstellationsSettings => settings.constellations,
);

/** The whole cluster, under the slice's own name. */
export const selectConstellations = selectRoute;

export const selectConstellationsEnabled = createSelector(
  [selectRoute],
  (route: ConstellationsSettings): boolean => route.enabled,
);
