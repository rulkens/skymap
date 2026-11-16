import { createSelector } from '@reduxjs/toolkit';

import { selectSettings } from '../../../../state/settings/selectSettings';
import type { AsteroidTuning } from '../../@types/AsteroidTuning';

/** The one root hop for this slice, spelled `selectRoute` in every slice. */
export const selectRoute = createSelector(
  [selectSettings],
  (settings): AsteroidTuning => settings.asteroidTuning,
);

/** The whole cluster, under the slice's own name. */
export const selectAsteroidTuning = selectRoute;
