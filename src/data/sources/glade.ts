import type { GalaxyCatalogSourceEntry } from '../../@types/data/galaxyCatalog/GalaxyCatalogSourceEntry';
import { Source } from '../source';

export const GLADE_ENTRY = {
  type: 'galaxyCatalog',
  code: Source.Glade,
  id: 'glade',
  label: 'GLADE',
  binBaseName: 'glade',
  allSky: true,
  visible: true,
  bearsLabel: false,
  bearsMarker: false,
  // Covers most of the GLADE distance distribution. GLADE has a long
  // sparse tail past 1 Gpc that the default framing deliberately clips.
  maxDistMpc: 1500,
  bandLabels: { u: '—', g: 'B', r: 'J', i: 'H', z: 'K' },
  // GLADE's g/r slots hold B and J: B−J is a long optical-to-NIR
  // baseline that separates early- from late-type galaxies cleanly.
  colourSpec: { slotA: 'g', slotB: 'r', rangeMin: 0.5, rangeMax: 3.5, kPerZ: 1.0 },
  // B-band parent samples (HyperLEDA, GWGC) — effective limit ≈ 18.
  mLim: 18.0,
  // Norberg et al. 2002 b_J Schechter as a stand-in for B (close
  // enough for visualisation purposes).
  schechter: { mStar: -20.83, alpha: -1.08, phiStar: 0.0093 },
  iauPrefix: 'GLADE',
  // small keeps the brightest 256k; medium ~400k; large uncapped.
  tierTargets: { small: 256_000, medium: 400_000 },
  // The M_abs cap empties the local volume (36 of ~10,300 galaxies inside
  // 40 Mpc survive at medium, 0 inside 10 Mpc). The B-band flux floor keeps
  // the apparently-bright nearby galaxies back, restoring the local volume
  // shell-free. ~+3,500 local at medium; see selectTierRecords.
  fluxSupplementMagLimit: 15,
  // Per-source SB boost — 1.0 = no boost.
  sbBoost: 1.0,
  falloffHalfMpc: 1000,
} as const satisfies GalaxyCatalogSourceEntry;
