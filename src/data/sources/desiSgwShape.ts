import type { GalaxyCatalogSourceEntry } from '../../@types/data/galaxyCatalog/GalaxyCatalogSourceEntry';
import { Source } from '../source';

export const DESI_SGW_SHAPE_ENTRY = {
  type: 'galaxyCatalog',
  code: Source.DesiSgwShape,
  id: 'desiSgwShape',
  label: 'Sloan Wall (sculpted)',
  binBaseName: 'desi-sgw-shape',
  // The ellipsoid-union sculpt of the Sloan Great Wall box (`desiSgw`): the same
  // wall, selected by a smooth union of ellipsoids with a feathered surface
  // rather than a hard box. A scaffold source that exists only for a visual A/B
  // against `desiSgw`; may be retired once one representation is chosen. Like the
  // box it is one floating volume in one slice of sky, so it opts out of the
  // all-sky camera-framing the bulk catalogs get.
  allSky: false,
  bearsLabel: false,
  bearsMarker: false,
  // Off by default: a specialist comparison overlay, not part of the all-sky
  // default scene. The GalaxiesSection toggle is the opt-in, same as its box
  // sibling and the other DESI patches.
  visible: false,
  // Pure BGS by geometry: the sculpt selects a subset of the same box's rows,
  // and LRG/ELG/QSO contribute nothing at z<0.1, so it holds only Bright Galaxy
  // Sample rows, topping out at z ≈ 0.095 (~400 Mpc). The generous ceiling is the
  // shared DESI-patch camera clamp; a source this shallow never reaches it.
  maxDistMpc: 7100,
  // DESI's LSS clustering catalogs carry DERED g/r/z fluxes (FLUX_G/R/Z_DERED,
  // nanomaggies). g → magG, r → magR directly; z (the photometric band, not
  // redshift) is the closest match to the empty magI slot among the five. Every
  // row here is real BGS photometry (no synthetic display mags), same as the box.
  bandLabels: { u: '—', g: 'g', r: 'r', i: 'z', z: '—' },
  // g−r is the natural DESI optical colour, calibrated to the REAL BGS g−r
  // distribution (p10 ≈ 0.36, median ≈ 0.61, p90 ≈ 0.90): 0.35–1.05 matches the
  // box/cone/wedge and puts the green-valley (g−r ≈ 0.7) at the ramp's white
  // midpoint so the blue cloud renders blue and the red sequence red. The
  // earlier 0.2–1.8 span compressed ~99% of real BGS galaxies into the ramp's
  // blue half. kPerZ is 0: the sculpt spans only z ≈ 0.055–0.095, a thin enough
  // shell that a K-correction coefficient would barely move the ramp.
  colourSpec: { slotA: 'g', slotB: 'r', rangeMin: 0.35, rangeMax: 1.05, kPerZ: 0.0 },
  // BGS_BRIGHT's r-band selection limit (r < 19.5); pure BGS, so this is the
  // actual limit. Not load-bearing — vMaxWeight short-circuits rather than
  // upweighting an unphysical volume.
  mLim: 19.5,
  // Placeholder triple, not a real DESI luminosity function: BGS has its own
  // selection function and doesn't follow a single Schechter LF. Same as the
  // box/cone/wedge — a display-shaping knob, not a physically-fit correctness
  // input.
  schechter: { mStar: -21.18, alpha: -1.16, phiStar: 0.0093 },
  // No established short-name convention for DESI coordinate designations in the
  // way SDSS/2MASX/GLADE have one; 'DESI' matches the survey's own name.
  iauPrefix: 'DESI',
  // Empty ⇒ tier-agnostic single desi-sgw-shape.bin shared across tiers, like
  // 2mrs.bin and the other DESI patches — the sculpt is already a curated row
  // count (a bounded volume, not a bulk all-sky catalog), so there's no need to
  // subsample per tier.
  tierTargets: {},
  // Seeded from the other DESI patches: a curated far-field catalog whose rows
  // can sit at faint apparent magnitudes needs a higher floor than the bulk
  // galaxy catalogs' 0.02 default, or the whole source pins to invisible. Visual
  // tuning knob, not a measured value.
  intensityFloor: 0.15,
  // Disable distance fade (an effectively-infinite half-distance): the wall spans
  // ~165 Mpc of depth, and the default ~1000 Mpc fade half-distance would dim its
  // far edge relative to its near edge — the whole structure should stay
  // uniformly lit. Same rationale as the box/cone/wedge.
  falloffHalfMpc: 1e30,
} as const satisfies GalaxyCatalogSourceEntry;
