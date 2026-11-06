import type { SurveyStarCatalogSourceEntry } from '../../../@types/data/starCatalog/SurveyStarCatalogSourceEntry';
import { Source } from '../../../data/source';

/**
 * Survey-wide Gaia stellar catalog — the bulk near-field stars, streamed as
 * one octree index plus chunk objects and drawn by the star renderer.
 *
 * The wide-field twin of the curated `famousStar` neighbourhood (FAMOUS_STAR_ENTRY):
 * that row seeds a hand-picked map from the body store; this one loads millions
 * of Gaia stars from disk. Like the volume rows (MCPM_ENTRY), it keeps its
 * presentation defaults in-row rather than in a separate settings table, so the
 * draw budget sits next to the `binBaseName` it governs. The 8–25 kpc handoff to
 * the procedural Milky-Way cloud is the Layer's `survey` band (`visibility.ts`).
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
  // Stars bypass the COSMO label/marker systems entirely — no per-star names
  // or rings — so neither capability flag is set.
  bearsLabel: false,
  bearsMarker: false,
  format: 'octree',
  binBaseName: 'stars',
  // Each tier's draw budget bounds Σ recordCount the GPU cut
  // (`cut.wesl`) emits. Sized so the small/medium tiers can refine to
  // (near-)all leaves when the camera is close. Starting values (grill Q9), raised
  // alongside `REFINE_ANGULAR_THRESHOLD`'s tightening (0.3 → 0.05): a lower
  // threshold refines more nodes at a given distance, so it wants more
  // headroom.
  budgets: {
    small: { drawBudget: 1_500_000, slots: 64 },
    medium: { drawBudget: 1_500_000, slots: 128 },
    large: { drawBudget: 1_500_000, slots: 256 },
  },
} as const satisfies SurveyStarCatalogSourceEntry;
