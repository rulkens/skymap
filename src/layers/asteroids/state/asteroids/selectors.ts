import { createSelector } from '@reduxjs/toolkit';

import { selectSettings } from '../../../../state/settings/selectSettings';
import type { AsteroidsSettings } from '../../@types/AsteroidsSettings';

/** The one root hop for this slice, spelled `selectRoute` in every slice. */
export const selectRoute = createSelector(
  [selectSettings],
  (settings): AsteroidsSettings => settings.asteroids,
);

/** The whole cluster, under the slice's own name. */
export const selectAsteroids = selectRoute;
