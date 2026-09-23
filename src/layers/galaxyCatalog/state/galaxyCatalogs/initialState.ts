import { DEFAULT_GALAXY_PROVENANCE } from '../defaults';
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
  items: {
    sdss: { enabled: true, labelEnabled: true },
    '2mrs': { enabled: true, labelEnabled: true },
    glade: { enabled: true, labelEnabled: true },
    famousGalaxy: { enabled: true, labelEnabled: true },
    milliquas: { enabled: true, labelEnabled: true },
    // The DESI patches boot hidden: a pencil-beam cone, a dec-band fan and the
    // Sloan Great Wall are specialist drill-down overlays, not part of the
    // all-sky default scene the other bulk catalogs populate.
    desiDeep: { enabled: false, labelEnabled: true },
    desiWedge: { enabled: false, labelEnabled: true },
    desiSgw: { enabled: false, labelEnabled: true },
  },
};
