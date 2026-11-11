import { createSelector } from '@reduxjs/toolkit';

import { selectSettings } from '../../../../state/settings/selectSettings';
import { GALAXY_CATALOG_SOURCE_ROWS } from '../../sources/galaxyCatalogSourceRows';
import type { GalaxyCatalogId } from '../../@types/GalaxyCatalogId';
import type { GalaxyCatalogSettings } from '../../@types/GalaxyCatalogSettings';
import type { GalaxyProvenanceSettings } from '../../@types/GalaxyProvenanceSettings';

/** The one root hop for this slice, spelled `selectRoute` in every slice. */
export const selectRoute = createSelector(
  [selectSettings],
  (settings): GalaxyCatalogSettings => settings.galaxyCatalogs,
);

/** The whole cluster, under the slice's own name. */
export const selectGalaxyCatalogs = selectRoute;

export const selectGalaxyCatalogSize = createSelector(
  [selectRoute],
  (route: GalaxyCatalogSettings): number => route.sizePx,
);

export const selectDepthFade = createSelector(
  [selectRoute],
  (route: GalaxyCatalogSettings): boolean => route.depthFade,
);

export const selectGalaxyProvenance = createSelector(
  [selectRoute],
  (route: GalaxyCatalogSettings): GalaxyProvenanceSettings => route.provenance,
);

/** The "Galaxy brightness" knob — the points draw layer writes it into `galaxySbScale` each frame. */
export const selectGalaxySbScale = createSelector(
  [selectRoute],
  (route: GalaxyCatalogSettings): number => route.sbScale,
);

/** Bloom ceiling — the max baked surface-brightness amplitude a galaxy can emit. */
export const selectGalaxySbMax = createSelector(
  [selectRoute],
  (route: GalaxyCatalogSettings): number => route.sbMax,
);

/** Readability-falloff exponent, gated by the depth-fade toggle. */
export const selectGalaxyFalloffStrength = createSelector(
  [selectRoute],
  (route: GalaxyCatalogSettings): number => route.falloffStrength,
);

/**
 * selectVisibleCatalogs — the ids of the galaxy catalogs whose `enabled` bit is
 * set, as the SettingsPanel checkboxes read them. The panel's intent set (no
 * fade-out tail), not an engine set: the engine derives its own from the values
 * core hands, in `visibleCatalogsOf`.
 */
export const selectVisibleCatalogs = createSelector(
  [selectRoute],
  (route): ReadonlySet<GalaxyCatalogId> => {
    const visible = new Set<GalaxyCatalogId>();
    for (const { id } of GALAXY_CATALOG_SOURCE_ROWS) {
      if (route.items[id].enabled) visible.add(id);
    }
    return visible;
  },
);
