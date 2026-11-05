import { createSelector } from '@reduxjs/toolkit';

import { selectSettings } from '../../../../state/settings/selectSettings';
import type { BlackHoleLensingTuning } from '../../@types/BlackHoleLensingTuning';

/** The one root hop for this slice, spelled `selectRoute` in every slice. */
export const selectRoute = createSelector(
  [selectSettings],
  (settings): BlackHoleLensingTuning => settings.blackHoleLensingTuning,
);

/** The whole tuning cluster — the slider board needs every knob at once. */
export const selectBlackHoleLensingTuning = selectRoute;
