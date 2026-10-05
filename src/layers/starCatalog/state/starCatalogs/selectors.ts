import { createSelector } from '@reduxjs/toolkit';

import { selectSettings } from '../../../../state/settings/selectSettings';
import type { StarCatalogSettings } from '../../../../@types/settings/StarCatalogSettings';
import type { StarCatalogId } from '../../../../@types/data/starCatalog/StarCatalogId';
import type { StarCatalogItemSettings } from '../../../../@types/settings/StarCatalogItemSettings';

/** The one root hop for this slice, spelled `selectRoute` in every slice. */
export const selectRoute = createSelector(
  [selectSettings],
  (settings): StarCatalogSettings => settings.starCatalogs,
);

/**
 * The whole star-catalogs cluster (master gate + shared size + shared
 * brightness + refine threshold + glow overlap + the three exposure-ramp
 * anchors + per-catalog items) — the Stars section reads it in one shot.
 */
export const selectStarCatalogs = selectRoute;

/**
 * The per-catalog item rows alone — the star-catalog twin of
 * `selectGalaxyCatalogItems`. `LabelHomes` reads the narrowest stable
 * reference it can get: the whole cluster would rebuild the label
 * projection on every star-brightness drag.
 */
export const selectStarCatalogItems = createSelector(
  [selectRoute],
  (route: StarCatalogSettings): Record<StarCatalogId, StarCatalogItemSettings> => route.items,
);
