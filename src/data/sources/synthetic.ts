import type { GalaxyCatalogSourceEntry } from '../../@types/data/galaxyCatalog/GalaxyCatalogSourceEntry';
import { Source } from '../source';

export const SYNTHETIC_ENTRY = {
  type: 'galaxyCatalog',
  code: Source.Synthetic,
  id: 'synthetic',
  label: 'Synthetic',
  binBaseName: null, // generated at runtime; no file
  allSky: true, // uniform-in-sphere by construction
  visible: true,
  bearsLabel: false,
  bearsMarker: false,
  maxDistMpc: 1000, // matches the radius in synthetic.ts
  bandLabels: { u: 'u', g: 'g', r: 'r', i: 'i', z: 'z' },
  colourSpec: { slotA: 'u', slotB: 'g', rangeMin: 0.5, rangeMax: 2.0, kPerZ: 3.0 },
  // Synthetic has no real galaxy catalog selection function; fall back to the
  // SDSS calibration so the bias-correction pathway has a total
  // `Record<Source, ...>` shape without inventing values.
  mLim: 17.77,
  schechter: { mStar: -21.18, alpha: -1.16, phiStar: 0.0093 },
  iauPrefix: 'Synth',
  tierTargets: {}, // no caps anywhere — synthetic is procedurally sized
  // Per-source SB boost — 1.0 = no boost.
  sbBoost: 1.0,
  falloffHalfMpc: 1e30,
} as const satisfies GalaxyCatalogSourceEntry;
