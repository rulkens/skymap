import { createSelector } from '@reduxjs/toolkit';

import { selectSettings } from '../../../../state/settings/selectSettings';
import type { StellarStreamsSettings } from '../../@types/StellarStreamsSettings';

/** The one root hop for this slice, spelled `selectRoute` in every slice. */
export const selectRoute = createSelector(
  [selectSettings],
  (settings): StellarStreamsSettings => settings.stellarStreams,
);

/** The whole cluster, under the slice's own name. */
export const selectStellarStreams = selectRoute;
