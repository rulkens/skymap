import { createSelector } from '@reduxjs/toolkit';

import { selectSettings } from '../../../../state/settings/selectSettings';
import type { VoyageSettings } from '../../@types/VoyageSettings';
import { voyageFrameBoost } from '../../../../utils/voyage/voyageFrameBoost';
import { voyageShipState } from '../../../../utils/voyage/voyageShipState';

/** The one root hop for this slice, spelled `selectRoute` in every slice. */
export const selectRoute = createSelector(
  [selectSettings],
  (settings): VoyageSettings => settings.voyage,
);

const simDaysArg = (_state: unknown, simDays: number): number => simDays;

/** The ship at sim instant `simDays`, or null with no trip launched. */
export const selectShipState = createSelector([selectRoute, simDaysArg], voyageShipState);

/** The voyage's observer frame at `simDays` — what the Layer's `boost` answers. */
export const selectFrameBoost = createSelector([selectRoute, simDaysArg], voyageFrameBoost);
