import { createSelector } from '@reduxjs/toolkit';

import { selectSettings } from '../../../../state/settings/selectSettings';
import type { BlackHolesSettings } from '../../../../@types/settings/BlackHolesSettings';

/** The one root hop for this slice, spelled `selectRoute` in every slice. */
export const selectRoute = createSelector(
  [selectSettings],
  (settings): BlackHolesSettings => settings.blackHoles,
);

/** The per-hole item rows alone — the narrow reference `LabelHomes` reads. */
export const selectBlackHoleItems = createSelector(
  [selectRoute],
  (route: BlackHolesSettings) => route.items,
);
