import type { SurveyStarCatalogSourceEntry } from '../../@types/data/starCatalog/SurveyStarCatalogSourceEntry';
import { Source } from '../source';

/**
 * Survey-wide Gaia stellar catalog — the bulk near-field star bin, streamed
 * as tiered `stars-<tier>.bin` point clouds and drawn by the star renderer.
 *
 * The wide-field twin of the curated `famousStar` neighbourhood (FAMOUS_STAR_ENTRY):
 * that row seeds a hand-picked map from the body store; this one loads millions
 * of Gaia stars from disk. Like the volume rows (MCPM_ENTRY), it keeps its
 * presentation defaults in-row rather than in a separate settings table, so the
 * draw budget and the crossfade band that hands off to the procedural Milky-Way
 * cloud sit next to the `binBaseName` they govern.
 */
export const GAIA_STARS_ENTRY = {
  type: 'starCatalog',
  code: Source.GaiaStars,
  id: 'gaiaStars',
  label: 'Gaia Stars',
  // A near-field bubble of stars around the observer, not a sky patch —
  // allSky:true matches the other non-catalog rows (the coverage-mask logic
  // only consults this flag for galaxy-catalog footprints).
  allSky: true,
  // On by default: the star bin is the real-data middle of the descent, part
  // of the baseline near-field scene. The flag never reaches ALL_VISIBLE_MASK
  // (galaxy-catalog rows only), so it's a scene-intent marker, not a bitmask
  // contributor — the stars gate through the star renderer's crossfade band.
  visible: true,
  // Stars bypass the COSMO label/marker systems entirely — no per-star names
  // or rings — so neither capability flag is set.
  bearsLabel: false,
  bearsMarker: false,
  binBaseName: 'stars',
  tiered: true, // small / medium / large `.bin` variants
  // Per-frame drawn-point budget: bounds Σ recordCount of the cut
  // `walkStarOctreeCut` emits. Sized so the small/medium tiers can refine to
  // (near-)all leaves when the camera is close, while `hardCap` protects the
  // draw-call count on the large tier. Starting values (grill Q9), raised
  // alongside `REFINE_ANGULAR_THRESHOLD`'s tightening (0.3 → 0.05): a lower
  // threshold refines more nodes at a given distance, so it wants more
  // headroom. Task 12 tunes both against real GPU timings.
  drawBudget: { typical: 1_500_000, hardCap: 2_500_000 },
  // Camera-distance band (parsecs) over which the survey stars crossfade to
  // the procedural Milky-Way cloud. Chosen so the stellar bubble starts
  // fading in while the cloud still dominates the view, reaching full
  // strength well inside the disk. First-pass eye-tuning from real-data
  // bring-up — this is the knob the tuning task iterates.
  crossfadePc: { inner: 8_000, outer: 25_000 },
} as const satisfies SurveyStarCatalogSourceEntry;
