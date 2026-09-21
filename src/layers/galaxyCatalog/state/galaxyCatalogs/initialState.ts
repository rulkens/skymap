/**
 * Rows are DERIVED from the galaxy-catalog registry entries so they can't
 * drift from the catalog set; each row's `enabled` is that entry's `visible`
 * (a hardcoded `true` would override a row that boots hidden, e.g. DesiDeep).
 */

import { SOURCE_ENTRIES } from '../../../../data/sourceEntries';
import { DEFAULT_GALAXY_PROVENANCE } from '../defaults';
import type { GalaxyCatalogId } from '../../../../@types/data/galaxyCatalog/GalaxyCatalogId';
import type { GalaxyCatalogItemSettings } from '../../../../@types/settings/GalaxyCatalogItemSettings';
import type { GalaxyCatalogSettings } from '../../../../@types/settings/GalaxyCatalogSettings';

export const initialState: GalaxyCatalogSettings = {
  // 2.5 px: a visible Gaussian disc on mid-DPI displays without ~3 M overlapping
  // galaxies painting the sky white. User range 1–8 px.
  sizePx: 2.5,
  brightness: 1.0, // identity on the shader's magnitude-derived intensity
  // Without the 1/(1 + (camDist/1000 Mpc)²) fade, additive billboards stack through the
  // catalog origin and the centre saturates to white regardless of HDR + tone-mapping.
  depthFade: true,
  provenance: DEFAULT_GALAXY_PROVENANCE,
  // sbScale multiplies each galaxy's baked surface-brightness amplitude into the HDR
  // field; 5.0 puts the mean galaxy's resolved core against the 2.0 bloom threshold.
  // sbMax is the live clamp on that amplitude. falloffStrength is k in
  // pow(resolvedFrac, k): 2 = physical inverse-square, 0.7 keeps the deep field visible.
  sbScale: 5.0,
  sbMax: 30.0,
  falloffStrength: 0.7,
  items: Object.fromEntries(
    SOURCE_ENTRIES.filter((e) => e.type === 'galaxyCatalog').map((e) => [
      e.id,
      { enabled: e.visible, labelEnabled: true },
    ]),
  ) as Record<GalaxyCatalogId, GalaxyCatalogItemSettings>,
};
