import type { GalaxyCatalogSourceEntry } from '../../@types/data/galaxyCatalog/GalaxyCatalogSourceEntry';
import { Source } from '../source';

export const DESI_SGW_ENTRY = {
  type: 'galaxyCatalog',
  code: Source.DesiSgw,
  id: 'desiSgw',
  label: 'Sloan Great Wall',
  binBaseName: 'desi-sgw',
  // A depth-bounded selection around the Sloan Great Wall — a smooth union of
  // ellipsoids on the wall's density peaks (see `makeEllipsoidUnionFilter`), not
  // a full-sky catalog. The camera-framing / all-sky treatment other bulk galaxy
  // catalogs get would be misleading for a source that is one floating volume
  // in one slice of sky.
  allSky: false,
  bearsLabel: false,
  bearsMarker: false,
  // Off by default: the first depth-bounded DESI patch — a bounded volume
  // isolating one named structure (the Sloan Great Wall), a third way of
  // drilling through DESI DR1 alongside the deep cone and the dec-band wedge —
  // is a specialist overlay, not part of the all-sky default scene the other
  // bulk catalogs populate. The GalaxiesSection toggle is the opt-in.
  visible: false,
  // Pure BGS by geometry: LRG/ELG/QSO contribute nothing at z<0.1, so the
  // selection holds only Bright Galaxy Sample rows, topping out at z ≈ 0.095 (~400 Mpc of
  // line-of-sight comoving distance under the pipeline's flat-ΛCDM conversion).
  // The generous ceiling is the shared DESI-patch camera clamp; a source this
  // shallow never reaches it, so there's nothing patch-specific to tune here.
  maxDistMpc: 7100,
  // DESI's LSS clustering catalogs carry DERED g/r/z fluxes (FLUX_G/R/Z_DERED,
  // nanomaggies). g → magG, r → magR directly; z (the photometric band, not
  // redshift) is the closest match to the empty magI slot among the five —
  // no u-band or true i-band exists in the DESI columns. Unlike the cone and
  // wedge, every row here is real BGS photometry (no synthetic display mags).
  bandLabels: { u: '—', g: 'g', r: 'r', i: 'z', z: '—' },
  // g−r is the natural DESI optical colour, calibrated to the REAL BGS g−r
  // distribution (p10 ≈ 0.36, median ≈ 0.61, p90 ≈ 0.90): 0.35–1.05 matches the
  // cone/wedge and puts the green-valley (g−r ≈ 0.7) at the ramp's white
  // midpoint so the blue cloud renders blue and the red sequence red. The
  // earlier 0.2–1.8 span compressed ~99% of real BGS galaxies into the ramp's
  // blue half. kPerZ is 0: the wall spans only z ≈ 0.055–0.095, a thin enough
  // shell that a K-correction coefficient would barely move the ramp.
  colourSpec: { slotA: 'g', slotB: 'r', rangeMin: 0.35, rangeMax: 1.05, kPerZ: 0.0 },
  // BGS_BRIGHT's r-band selection limit (r < 19.5); the box is pure BGS, so
  // this is the actual limit rather than a representative one. Not load-bearing
  // — vMaxWeight short-circuits rather than upweighting an unphysical volume.
  mLim: 19.5,
  // Placeholder triple, not a real DESI luminosity function: BGS has its own
  // selection function and doesn't follow a single Schechter LF. Same as the
  // cone/wedge — a display-shaping knob, not a physically-fit correctness input.
  schechter: { mStar: -21.18, alpha: -1.16, phiStar: 0.0093 },
  // No established short-name convention for DESI coordinate designations in
  // the way SDSS/2MASX/GLADE have one; 'DESI' matches the survey's own name.
  iauPrefix: 'DESI',
  // Empty ⇒ tier-agnostic single desi-sgw.bin shared across tiers, like 2mrs.bin
  // and the other DESI patches — the selection is already a curated row count (a
  // bounded volume, not a bulk all-sky catalog), so there's no need to
  // subsample per tier.
  tierTargets: {},
  // Per-source SB boost — 1.0 = no boost.
  sbBoost: 1.0,
  // Disable distance fade (an effectively-infinite half-distance): the wall
  // spans ~165 Mpc of depth, and the default ~1000 Mpc fade half-distance would
  // dim its far edge relative to its near edge — the whole structure should
  // stay uniformly lit. Same rationale as the cone/wedge.
  falloffHalfMpc: 1e30,
} as const satisfies GalaxyCatalogSourceEntry;
