import { createSelector } from '@reduxjs/toolkit';

import { selectSettings } from '../../../../state/settings/selectSettings';
import type { FlowSettings } from '../../../../@types/settings/FlowSettings';

/** The one root hop for this slice, spelled `selectRoute` in every slice. */
export const selectRoute = createSelector(
  [selectSettings],
  (settings): FlowSettings => settings.flow,
);

/** The whole cluster, under the slice's own name. */
export const selectFlow = selectRoute;
