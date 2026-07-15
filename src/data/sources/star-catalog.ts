import type { StarCatalogSourceEntry } from '../../@types/data/starCatalog/StarCatalogSourceEntry';
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
export const STAR_CATALOG_ENTRY = {
  type: 'starCatalog',
  code: Source.StarCatalog,
  id: 'starCatalog',
  label: 'Stars',
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
  // Per-frame drawn-point budget. Starting values (grill Q9) — Task 12 tunes
  // these against real GPU timings; frozen here so the renderer has a contract
  // to key off before the perf pass lands.
  drawBudget: { typical: 1_000_000, hardCap: 2_000_000 },
  // Camera-distance band (parsecs) over which the survey stars crossfade to
  // the procedural Milky-Way cloud (spec §7, ~2→5 kpc). Starting values —
  // Task 12 tunes the endpoints.
  crossfadePc: { inner: 2_000, outer: 5_000 },
} as const satisfies StarCatalogSourceEntry;
