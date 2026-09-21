import { createSelector } from '@reduxjs/toolkit';

import { selectSettings } from '../../selectSettings';
import type { OrbitTrailsSettings } from '../../../../@types/settings/OrbitTrailsSettings';

/** The one root hop for this slice, spelled `selectRoute` in every slice. */
export const selectRoute = createSelector(
  [selectSettings],
  (settings): OrbitTrailsSettings => settings.orbitTrails,
);

/** The whole cluster, under the slice's own name. */
export const selectOrbitTrails = selectRoute;

export const selectOrbitTrailsEnabled = createSelector(
  [selectRoute],
  (route: OrbitTrailsSettings): boolean => route.enabled,
);
