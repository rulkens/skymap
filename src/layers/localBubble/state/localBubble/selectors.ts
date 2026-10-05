import { createSelector } from '@reduxjs/toolkit';

import { selectSettings } from '../../../../state/settings/selectSettings';
import type { LocalBubbleSettings } from '../../../../@types/settings/LocalBubbleSettings';

/** The one root hop for this slice, spelled `selectRoute` in every slice. */
export const selectRoute = createSelector(
  [selectSettings],
  (settings): LocalBubbleSettings => settings.localBubble,
);

/** The whole cluster, under the slice's own name. */
export const selectLocalBubble = selectRoute;
