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
  // Synthetic is the "no real data, show *something*" fallback — must be
  // aggressively visible.  Match Milliquas: higher floor + no depth fade.
  // Bulk-galaxy catalog defaults (floor=0.02 / falloff=1000) at radius 1000 Mpc
  // attenuate the cloud to a near-black haze against the additive HDR
  // target — the symptom the fallback exists to prevent in the first place.
  intensityFloor: 0.15,
  falloffHalfMpc: 1e30,
} as const satisfies GalaxyCatalogSourceEntry;
