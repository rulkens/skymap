import type { GalaxyCatalogSourceEntry } from '../../@types/data/galaxyCatalog/GalaxyCatalogSourceEntry';
import { Source } from '../source';

export const DESI_DEEP_ENTRY = {
  type: 'galaxyCatalog',
  code: Source.DesiDeep,
  id: 'desiDeep',
  label: 'DESI Deep Field',
  binBaseName: 'desi-deep',
  // A single narrow pencil-beam cone (Corona Borealis), not a full-sky
  // catalog — the camera-framing / all-sky treatment other bulk galaxy
  // catalogs get would be misleading for a source that only covers one
  // patch of sky.
  allSky: false,
  bearsLabel: false,
  bearsMarker: false,
  // Visible by default: Milliquas precedent (a new galaxy catalog ships on
  // rather than opt-in). The GalaxiesSection toggle (Task 9) is the off
  // switch a user reaches for if the far-tail cone is distracting.
  visible: true,
  // z ≈ 3.5 comoving (the QSO tracer's redshift ceiling) works out past
  // 7000 Mpc under the renderer's linear-Hubble display approximation —
  // extends the camera clamp well past Milliquas's 4000, since DESI's
  // QSO tail reaches noticeably deeper than Milliquas's bulk z < 3.
  maxDistMpc: 7100,
  // DESI's LSS clustering catalogs carry DERED g/r/z fluxes (FLUX_G/R/Z_DERED,
  // nanomaggies). g → magG, r → magR directly; z (the photometric band, not
  // redshift) is the closest match to the empty magI slot among the five —
  // no u-band or true i-band exists in the DESI columns.
  bandLabels: { u: '—', g: 'g', r: 'r', i: 'z', z: '—' },
  // g−r is the natural DESI optical colour. Range widened past Milliquas's
  // B−R span (0.2–1.8 vs 0.0–2.0) to better bracket the mixed BGS/LRG/ELG/QSO
  // population. kPerZ is 0 for the same reason Milliquas's is: the four
  // tracers span z ≈ 0.03–3.5, and any non-zero K-correction coefficient
  // would clamp most of that range to one end of the ramp rather than
  // meaningfully correcting it.
  colourSpec: { slotA: 'g', slotB: 'r', rangeMin: 0.2, rangeMax: 1.8, kPerZ: 0.0 },
  // BGS_BRIGHT's r-band selection limit (r < 19.5) is the tightest of the
  // four tracers; used as a permissive stand-in for the whole mixed-tracer
  // catalog, same rationale as Milliquas's single mLim across a
  // heterogeneous parent-survey mix — vMaxWeight short-circuits rather than
  // upweighting an unphysical volume.
  mLim: 19.5,
  // Placeholder triple, not a real DESI luminosity function: the four
  // tracers (BGS/LRG/ELG/QSO) each have their own selection function and
  // none follow a single Schechter LF. Milliquas precedent — one Schechter
  // triple is meaningless across a mixed-tracer population; this is a
  // display-shaping knob, not a physically-fit correctness input.
  schechter: { mStar: -21.18, alpha: -1.16, phiStar: 0.0093 },
  // No established short-name convention for DESI coordinate designations
  // in the way SDSS/2MASX/GLADE have one; 'DESI' matches the survey's own
  // name.
  iauPrefix: 'DESI',
  // Empty ⇒ tier-agnostic single desi-deep.bin shared across tiers, like
  // 2mrs.bin — the deep cone is already a small, curated row count (a
  // narrow pencil-beam, not a bulk all-sky catalog), so there's no need to
  // subsample per tier.
  tierTargets: {},
  // Seeded from Milliquas: a sparse far-field catalog whose rows sit at
  // faint apparent magnitudes needs a higher floor than the bulk galaxy
  // catalogs' 0.02 default, or the whole source pins to invisible. Visual
  // tuning knob, not a measured value.
  intensityFloor: 0.15,
  // Disable distance fade (an effectively-infinite half-distance): the
  // z ≈ 3.5 tail reaching past 7000 Mpc is the entire point of this source,
  // and the default ~1000 Mpc fade half-distance would extinguish it long
  // before the camera gets there. Same rationale as Milliquas.
  falloffHalfMpc: 1e30,
} as const satisfies GalaxyCatalogSourceEntry;
