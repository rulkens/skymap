import { createSelector } from '@reduxjs/toolkit';

import { selectSettings } from '../../../../state/settings/selectSettings';
import type { MilkyWayParts } from '../../@types/MilkyWayParts';
import type { MilkyWayRenderer } from '../../@types/MilkyWayRenderer';
import type { MilkyWaySettings } from '../../@types/MilkyWaySettings';

/** The one root hop for this slice, spelled `selectRoute` in every slice. */
export const selectRoute = createSelector(
  [selectSettings],
  (settings): MilkyWaySettings => settings.milkyWay,
);

/** The whole cluster, under the slice's own name. */
export const selectMilkyWay = selectRoute;

const PARTS_BY_RENDERER: Readonly<Record<MilkyWayRenderer, MilkyWayParts>> = {
  v1: { cloud: true, cloudDust: true, field: false },
  v2: { cloud: false, cloudDust: false, field: true },
  both: { cloud: true, cloudDust: false, field: true },
};

/** The only reader of `renderer`. */
export function selectMilkyWayParts(settings: MilkyWaySettings): MilkyWayParts {
  return PARTS_BY_RENDERER[settings.renderer];
}
