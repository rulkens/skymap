import type { GalaxyCatalogSourceEntry } from '../../@types/data/galaxyCatalog/GalaxyCatalogSourceEntry';
import { Source } from '../source';

export const DESI_WEDGE_ENTRY = {
  type: 'galaxyCatalog',
  code: Source.DesiWedge,
  id: 'desiWedge',
  label: 'DESI Wedge',
  binBaseName: 'desi-wedge',
  // A dec-band fan through one arm of the DR1 footprint, not a full-sky
  // catalog — the camera-framing / all-sky treatment other bulk galaxy
  // catalogs get would be misleading for a source that only covers one
  // slice of sky.
  allSky: false,
  bearsLabel: false,
  bearsMarker: false,
  // Off by default: a 2.5°-thick declination-band wedge is a specialist
  // overlay — a second way of drilling through DESI DR1 alongside the deep
  // cone — not part of the all-sky default scene the other bulk catalogs
  // populate. The GalaxiesSection toggle is the opt-in for anyone who wants
  // the wedge (or to compare it against the cone).
  visible: false,
  // Same four tracers as the deep cone: the QSO tail's z ≈ 3.5 maps to
  // ~7100 Mpc of line-of-sight comoving distance under the flat-ΛCDM
  // conversion the pipeline applies to every row (`redshiftToDistanceMpc`,
  // Simpson-integrated). That comoving ceiling extends the camera clamp well
  // past Milliquas's 4000.
  maxDistMpc: 7100,
  // DESI's LSS clustering catalogs carry DERED g/r/z fluxes (FLUX_G/R/Z_DERED,
  // nanomaggies). g → magG, r → magR directly; z (the photometric band, not
  // redshift) is the closest match to the empty magI slot among the five —
  // no u-band or true i-band exists in the DESI columns.
  bandLabels: { u: '—', g: 'g', r: 'r', i: 'z', z: '—' },
  // g−r is the natural DESI optical colour, calibrated to the REAL BGS g−r
  // distribution (p10 ≈ 0.36, median ≈ 0.61, p90 ≈ 0.90): 0.35–1.05 puts the
  // green-valley (g−r ≈ 0.7) at the ramp's white midpoint so the blue cloud
  // renders blue and the red sequence red. The earlier 0.2–1.8 span bracketed
  // the synthetic tracer constants but compressed ~99% of real BGS galaxies
  // into the ramp's blue half. Tracers still land at the extremes: LRG 1.4 →
  // red, ELG 0.5 / QSO 0.3 → blue. kPerZ is 0: the tracers span z ≈ 0.03–3.5, so
  // one K-correction slope would clamp most of that to one ramp end, and the
  // low-z BGS near-field where colour reads needs little correction.
  colourSpec: { slotA: 'g', slotB: 'r', rangeMin: 0.35, rangeMax: 1.05, kPerZ: 0.0 },
  // BGS_BRIGHT's r-band selection limit (r < 19.5) is the tightest of the
  // four tracers; used as a single representative limit for the whole
  // mixed-tracer catalog, same rationale as the deep cone — the exact value
  // isn't load-bearing because vMaxWeight short-circuits rather than
  // upweighting an unphysical volume.
  mLim: 19.5,
  // Placeholder triple, not a real DESI luminosity function: the four
  // tracers (BGS/LRG/ELG/QSO) each have their own selection function and
  // none follow a single Schechter LF. Same as the deep cone — a
  // display-shaping knob, not a physically-fit correctness input.
  schechter: { mStar: -21.18, alpha: -1.16, phiStar: 0.0093 },
  // No established short-name convention for DESI coordinate designations
  // in the way SDSS/2MASX/GLADE have one; 'DESI' matches the survey's own
  // name.
  iauPrefix: 'DESI',
  // Empty ⇒ tier-agnostic single desi-wedge.bin shared across tiers, like
  // 2mrs.bin and the deep cone — the wedge is already a curated row count (a
  // dec-band fan through one footprint arm, not a bulk all-sky catalog), so
  // there's no need to subsample per tier.
  tierTargets: {},
  // Per-source SB boost — 1.0 = no boost.
  sbBoost: 1.0,
  // Disable distance fade (an effectively-infinite half-distance): the
  // z ≈ 3.5 tail reaching past 7000 Mpc is the entire point of this source,
  // and the default ~1000 Mpc fade half-distance would extinguish it long
  // before the camera gets there. Same rationale as the deep cone.
  falloffHalfMpc: 1e30,
} as const satisfies GalaxyCatalogSourceEntry;
