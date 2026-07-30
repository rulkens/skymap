import type { GalaxyCatalogSourceEntry } from '../../@types/data/galaxyCatalog/GalaxyCatalogSourceEntry';
import { Source } from '../source';

export const TWOMRS_ENTRY = {
  type: 'galaxyCatalog',
  code: Source.TwoMRS,
  id: '2mrs',
  label: '2MRS',
  binBaseName: '2mrs',
  allSky: true,
  visible: true,
  bearsLabel: false,
  bearsMarker: false,
  // Flux-limited at K_s ≈ 11.75; effective z ≲ 0.06.
  maxDistMpc: 250,
  bandLabels: { u: '—', g: 'J', r: 'H', i: 'K', z: '—' },
  // 2MRS has no u/z slots — fall back to J−K (the widest NIR colour
  // pair) for galaxy-type information. K-correction is negligible at
  // the galaxy catalog's effective z ≲ 0.06.
  colourSpec: { slotA: 'g', slotB: 'i', rangeMin: 0.7, rangeMax: 1.1, kPerZ: 0.0 },
  // Huchra et al. 2012 — K_s ≤ 11.75.
  mLim: 11.75,
  // Kochanek et al. 2001, K-band Schechter from 2MASS.
  schechter: { mStar: -24.13, alpha: -1.1, phiStar: 0.0116 },
  // 2MRS rows carry 2MASS XSC IDs — use the XSC short-name convention.
  iauPrefix: '2MASX',
  // ~44k rows total — small enough to ship intact at every tier; no caps.
  tierTargets: {},
  // Per-source SB boost — 1.0 = no boost.
  sbBoost: 1.0,
  falloffHalfMpc: 1000,
} as const satisfies GalaxyCatalogSourceEntry;
