import { createSelector } from '@reduxjs/toolkit';

import { selectSettings } from '../../../../state/settings/selectSettings';
import { GALAXY_CATALOG_SOURCES, SOURCE_REGISTRY } from '../../../../data/sources';
import { maskWith } from '../../../../utils/maskWith';
import type { GalaxyCatalogSettings } from '../../../../@types/settings/GalaxyCatalogSettings';
import type { GalaxyCatalogId } from '../../../../@types/data/galaxyCatalog/GalaxyCatalogId';
import type { GalaxyCatalogItemSettings } from '../../../../@types/settings/GalaxyCatalogItemSettings';
import type { GalaxyProvenanceSettings } from '../../../../@types/settings/GalaxyProvenanceSettings';

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

export const selectGalaxyCatalogItems = createSelector(
  [selectRoute],
  (route: GalaxyCatalogSettings): Record<GalaxyCatalogId, GalaxyCatalogItemSettings> => route.items,
);

/**
 * selectVisibleSourceMask — projects the per-galaxy-catalog `enabled` bits into
 * the 32-bit galaxy-catalog-visibility bitmask the SettingsPanel checkboxes
 * read. NOT authoritative state — it reproduces `deriveSourceMasks`' `pick`
 * mask (intent only, no fade-out tail) by iterating `GALAXY_CATALOG_SOURCES`
 * in the same order with the same `maskWith`.
 */
export const selectVisibleSourceMask = createSelector([selectRoute], (route) => {
  let mask = 0;
  for (const src of GALAXY_CATALOG_SOURCES) {
    // `src ∈ GALAXY_CATALOG_SOURCES` ⇒ its registry id is a galaxy catalog id; the broad
    // `SourceId` typing on `.id` doesn't know that, so the cast is safe.
    const id = SOURCE_REGISTRY[src].id as GalaxyCatalogId;
    if (route.items[id].enabled) mask = maskWith(mask, src);
  }
  return mask;
});
