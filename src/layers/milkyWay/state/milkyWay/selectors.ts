import { createSelector } from '@reduxjs/toolkit';

import { selectSettings } from '../../../../state/settings/selectSettings';
import type { MilkyWaySettings } from '../../../../@types/settings/MilkyWaySettings';

/** The one root hop for this slice, spelled `selectRoute` in every slice. */
export const selectRoute = createSelector(
  [selectSettings],
  (settings): MilkyWaySettings => settings.milkyWay,
);

/** The whole cluster, under the slice's own name. */
export const selectMilkyWay = selectRoute;

export const selectMilkyWayLabelEnabled = createSelector(
  [selectRoute],
  (route: MilkyWaySettings): boolean => route.labelEnabled,
);
