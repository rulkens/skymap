import { createSelector } from '@reduxjs/toolkit';

import { selectSettings } from '../../../../state/settings/selectSettings';
import { GALAXY_CATALOG_SOURCE_ROWS } from '../../sources/galaxyCatalogSourceRows';
import { GALAXY_CATALOG_SOURCES } from '../../sources/galaxyCatalogSources';
import { galaxyCatalogFormatOf } from '../../utils/galaxyCatalogFormatOf';
import { maskWith } from '../../../../utils/maskWith';
import type { GalaxyCatalogSettings } from '../../../../@types/settings/GalaxyCatalogSettings';
import type { GalaxyCatalogFormat } from '../../../../@types/data/galaxyCatalog/GalaxyCatalogFormat';
import type { GalaxyCatalogSourceType } from '../../@types/GalaxyCatalogSourceType';
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

/**
 * selectVisibleSourceMask — projects the per-galaxy-catalog `enabled` bits into
 * the 32-bit galaxy-catalog-visibility bitmask the SettingsPanel checkboxes
 * read. The panel's intent mask (no fade-out tail), not an engine mask: the
 * engine derives its own from the values core hands, in `sourceMaskOf`.
 */
export const selectVisibleSourceMask = createSelector([selectRoute], (route) => {
  let mask = 0;
  for (const [code, { id }] of GALAXY_CATALOG_SOURCE_ROWS) {
    if (route.items[id].enabled) mask = maskWith(mask, code);
  }
  return mask;
});

/** Each source's format as the setting, else the row's default (see `galaxyCatalogFormatOf`). */
export const selectGalaxyCatalogFormats = createSelector(
  [selectRoute],
  (route): Partial<Record<GalaxyCatalogSourceType, GalaxyCatalogFormat>> =>
    Object.fromEntries(
      GALAXY_CATALOG_SOURCES.map((src) => [src, galaxyCatalogFormatOf(route.formats, src)]),
    ),
);

export const selectGalaxyCatalogFormat = (
  state: Parameters<typeof selectSettings>[0],
  source: GalaxyCatalogSourceType,
): GalaxyCatalogFormat => selectGalaxyCatalogFormats(state)[source]!;
