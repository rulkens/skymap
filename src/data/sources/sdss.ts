import type { GalaxyCatalogSourceEntry } from '../../@types/data/galaxyCatalog/GalaxyCatalogSourceEntry';
import { Source } from '../source';

export const SDSS_ENTRY = {
  type: 'galaxyCatalog',
  code: Source.SDSS,
  id: 'sdss',
  label: 'SDSS',
  binBaseName: 'sdss',
  allSky: false,
  visible: true,
  bearsLabel: false,
  bearsMarker: false,
  // Main galaxy sample reaches z ~ 0.7+ for luminous red galaxies;
  // rounded up generously.
  maxDistMpc: 3000,
  bandLabels: { u: 'u', g: 'g', r: 'r', i: 'i', z: 'z' },
  colourSpec: { slotA: 'u', slotB: 'g', rangeMin: 0.5, rangeMax: 2.0, kPerZ: 3.0 },
  // r-band spec completeness limit (SDSS DR1+).
  mLim: 17.77,
  // Blanton et al. 2003, r-band LF for the spec sample.
  schechter: { mStar: -21.18, alpha: -1.16, phiStar: 0.0093 },
  iauPrefix: 'SDSS',
  // small drops SDSS entirely to keep the mobile GPU budget;
  // medium caps at ~156k brightest; large is uncapped (key absent).
  tierTargets: { small: 0, medium: 156_000 },
  // SDSS wins crossMatch priority over GLADE, so local galaxies inside the
  // SDSS footprint land in this bucket and the M_abs cap drops nearly all of
  // them (3,469 local in large → 1 in medium). The g-band flux floor recovers
  // them. Only affects medium; small is excluded entirely.
  fluxSupplementMagLimit: 15,
  intensityFloor: 0.02,
  falloffHalfMpc: 1000,
} as const satisfies GalaxyCatalogSourceEntry;
