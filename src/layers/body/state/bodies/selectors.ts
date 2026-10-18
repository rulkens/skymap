import { createSelector } from '@reduxjs/toolkit';

import { selectSettings } from '../../../../state/settings/selectSettings';
import type { BodySettings } from '../../../../@types/settings/BodySettings';

/** The one root hop for this slice, spelled `selectRoute` in every slice. */
export const selectRoute = createSelector(
  [selectSettings],
  (settings): BodySettings => settings.bodies,
);

/** The whole cluster, under the slice's own name. */
export const selectBodies = selectRoute;
