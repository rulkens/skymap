import { createSelector } from '@reduxjs/toolkit';

import { selectSettings } from '../../../../state/settings/selectSettings';
import type { ProbeSpheresSettings } from '../../@types/ProbeSpheresSettings';

/** The one root hop for this slice, spelled `selectRoute` in every slice. */
export const selectRoute = createSelector(
  [selectSettings],
  (settings): ProbeSpheresSettings => settings.probeSpheres,
);

/** The whole cluster, under the slice's own name. */
export const selectProbeSpheres = selectRoute;
