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
  v1: Object.freeze({ cloud: true, cloudDust: true, field: false }),
  v2: Object.freeze({ cloud: false, cloudDust: false, field: true }),
  both: Object.freeze({ cloud: true, cloudDust: false, field: true }),
};

/**
 * The only reader of `renderer`. One frozen row per renderer, so a caller
 * comparing parts by identity sees a change only when the renderer changes.
 */
export function selectMilkyWayParts(settings: MilkyWaySettings): MilkyWayParts {
  return PARTS_BY_RENDERER[settings.renderer];
}
