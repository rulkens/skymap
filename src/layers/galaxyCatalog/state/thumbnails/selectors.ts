import { createSelector } from '@reduxjs/toolkit';

import { selectSettings } from '../../../../state/settings/selectSettings';
import type { ThumbnailsSettings } from '../../../../@types/settings/ThumbnailsSettings';

/** The one root hop for this slice, spelled `selectRoute` in every slice. */
export const selectRoute = createSelector(
  [selectSettings],
  (settings): ThumbnailsSettings => settings.thumbnails,
);

/** The whole cluster, under the slice's own name. */
export const selectThumbnails = selectRoute;
