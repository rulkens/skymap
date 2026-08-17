import type { GalaxyCatalogSourceEntry } from '../../@types/data/galaxyCatalog/GalaxyCatalogSourceEntry';
import { Source } from '../source';

export const FAMOUS_GALAXY_ENTRY = {
  type: 'galaxyCatalog',
  code: Source.FamousGalaxy,
  id: 'famousGalaxy',
  label: 'Famous',
  binBaseName: 'famous',
  allSky: true, // hand-picked entries from across the sky
  visible: true,
  bearsLabel: true,
  bearsMarker: false,
  labelLayer: 'galaxy',
  detailLabel: 'Famous Galaxy',
  shortLabel: 'Galaxy',
  plural: 'Famous Galaxies',
  maxDistMpc: 200, // covers the curated set: M31 → NGC 4889
  // Famous entries don't carry per-row photometry — the source galaxy catalog
  // already measured it. The SDSS-mirroring labels are cosmetic so the
  // InfoCard renders generic "(g)" tags without a new branch; the
  // stored mag values are NaN, which FullCard renders as "N/A".
  bandLabels: { u: 'u', g: 'g', r: 'r', i: 'i', z: 'z' },
  // Mirror SDSS so the colour ramp maps g−r cleanly; kPerZ = 0 since
  // these entries are all very nearby (z < 0.05).
  colourSpec: { slotA: 'u', slotB: 'g', rangeMin: 0.5, rangeMax: 2.0, kPerZ: 0.0 },
  // Famous entries have NaN photometry (vMaxWeight short-circuits to 0
  // for those rows), so the bias-pipeline never actually consumes
  // these. Mirror the SDSS calibration to keep the registry total.
  mLim: 17.77,
  schechter: { mStar: -21.18, alpha: -1.16, phiStar: 0.0093 },
  iauPrefix: 'Famous',
  // ~150 rows total — never subsampled; one file shared across tiers.
  tierTargets: {},
  // Per-source SB boost — 1.0 = no boost.
  //
  // Famous runs HOT without a trim, and the cause is a systematic in the
  // surface-brightness model rather than missing photometry (77 of the 80
  // seed rows carry a real magB). `galaxySbAmp` divides a catalog-RELATIVE
  // luminosity (normalised against this catalog's own medianAbsMag) by an
  // ABSOLUTE size reference (a fixed 30 kpc). Famous galaxies have a median
  // diameter of 25.4 kpc, so that size term alone inflates every row by
  // 1/0.847^2 = 1.39x; combined with the log-space-average-then-exponentiate
  // skew the measured median `raw` lands at 2.14 against a nominal 1.0, with
  // a tail to 11.7 (NGC 4449). Since every row then clears the 2.0 bloom
  // threshold, the whole catalog blooms at once and reads as blown out —
  // and the sbMax ceiling never engages (0 of 80 rows reach it).
  //
  // 0.45 ~= 1/2.14 re-centres the catalog's median on the same amplitude a
  // typical survey galaxy gets, preserving the internal spread (M32 still
  // outshines a big diffuse spiral). This is a per-source trim, NOT a fix
  // for the relative-vs-absolute mismatch — normalising the size term
  // per-catalog would address that generally, at the cost of re-tuning
  // every other catalog's brightness.
  sbBoost: 0.45,
  falloffHalfMpc: 1000,
} as const satisfies GalaxyCatalogSourceEntry;
